// Purpose: Decide one refresh-token exchange inside the caller's transaction: rotate a live
//   token, hand the same successor to requests within the grace window, delete expired tokens,
//   and revoke the session family when a rotated token is reused after the grace window.
// Caller: auth.service (refreshAccessToken), which owns the transaction and maps the outcome
//   to HTTP errors after commit.
// Dependencies: auth.repository, refresh-successor (sealed successor), utils/token,
//   config/env (REFRESH_TOKEN_EXPIRES_DAYS, REFRESH_GRACE_SECONDS).
// Main Functions: rotateRefreshToken, RotationOutcome.
// Side Effects: refresh_tokens writes through the given transaction: marks the presented row
//   rotated and inserts its successor, deletes an expired row, or deletes a whole family.
// Notes: The outcome is returned, never thrown, so deletions for expired and reused tokens
//   commit. Requires READ COMMITTED (PostgreSQL's default): a request that loses the rotation
//   claim waits for the winner's commit, and its next statement sees the committed successor.
import authRepository from './auth.repository'
import { openSuccessor, sealSuccessor } from './refresh-successor'
import { generateToken, hashToken } from '../../utils/token'
import { env } from '../../config/env'
import { PrismaTx } from '../../types/prisma'
import { RefreshToken } from '@prisma/client'

export type RotationOutcome =
  | { kind: 'issued'; userId: number; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reused'; userId: number; familyId: string }

const INVALID: RotationOutcome = { kind: 'invalid' }

// More successive rotations than this inside one grace window are treated as invalid
// (no revocation); real clients rotate once per access-token lifetime.
const MAX_SUCCESSOR_HOPS = 5

export async function rotateRefreshToken(
  token: string,
  tx: PrismaTx,
  now: Date = new Date(),
): Promise<RotationOutcome> {
  const hashedToken = hashToken(token)
  let record = await authRepository.findRefreshToken(hashedToken, tx)
  if (!record) return INVALID

  if (record.expiresAt <= now) {
    await authRepository.deleteRefreshToken(hashedToken, tx)
    return { kind: 'expired' }
  }

  if (!record.rotatedAt) {
    const successor = generateToken()
    const claimed = await authRepository.markRefreshTokenRotated(
      record.id,
      sealSuccessor(token, hashedToken, successor),
      now,
      tx,
    )
    if (claimed) {
      await authRepository.createRefreshToken(
        {
          token: hashToken(successor),
          userId: record.userId,
          familyId: record.familyId,
          expiresAt: new Date(
            now.getTime() + env.REFRESH_TOKEN_EXPIRES_DAYS * 86_400_000,
          ),
        },
        tx,
      )
      return { kind: 'issued', userId: record.userId, refreshToken: successor }
    }

    // Lost the claim: the winner has committed, so this read sees its rotation, or no row
    // when the family was revoked in the meantime.
    record = await authRepository.findRefreshToken(hashedToken, tx)
    if (!record?.rotatedAt) return INVALID
  }

  if (now.getTime() - record.rotatedAt!.getTime() > env.REFRESH_GRACE_SECONDS * 1000) {
    await authRepository.deleteRefreshTokenFamily(record.userId, record.familyId, tx)
    return { kind: 'reused', userId: record.userId, familyId: record.familyId }
  }

  return await latestSuccessor(token, record, tx, now)
}

// Walk token → successor → … to the live token of the family. Every later hop was rotated
// after the presented token, so it is inside its own grace window too: the walk grants nothing
// that presenting each token in turn would not, but a late request never receives a stale
// successor that would overwrite a newer cookie and later look like reuse.
async function latestSuccessor(
  token: string,
  record: RefreshToken,
  tx: PrismaTx,
  now: Date,
): Promise<RotationOutcome> {
  let currentToken = token
  let current = record
  for (let hop = 0; hop < MAX_SUCCESSOR_HOPS; hop++) {
    const next = current.successorCiphertext
      ? openSuccessor(currentToken, current.token, current.successorCiphertext)
      : null
    if (!next) return INVALID

    const row = await authRepository.findRefreshToken(hashToken(next), tx)
    if (!row || row.expiresAt <= now) return INVALID
    if (!row.rotatedAt) {
      return { kind: 'issued', userId: row.userId, refreshToken: next }
    }
    currentToken = next
    current = row
  }
  return INVALID
}
