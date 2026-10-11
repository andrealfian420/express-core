// Purpose: Data access for authentication: users by email, refresh tokens (rotation, family
//   revocation, expiry cleanup), email verification tokens and password-reset tokens.
// Caller: auth.service, auth/refresh-rotation, profile.service, user.service, system.service.
// Dependencies: Prisma client (optionally a transaction client).
// Main Functions: findUserByEmail, findUserByEmailInsensitive, findActiveRoleIdBySlug,
//   createUser, createRefreshToken, findRefreshToken,
//   markRefreshTokenRotated, deleteRefreshToken, deleteRefreshTokenFamily,
//   deleteRefreshTokensByUserId, deleteExpiredRefreshTokens, createEmailVerificationToken,
//   createPasswordResetToken, deleteUnusedPasswordResetTokens, findUniqueToken,
//   deletePasswordResetToken, updatePasswordResetToken.
// Side Effects: Reads and writes users, refresh_tokens, email_verification_tokens and
//   password_reset_tokens; deleteExpiredRefreshTokens deletes in bounded batches.
// Notes: Session revocations repeat their DELETE until it matches nothing, so a rotation that
//   was committing while the revocation ran cannot leave a live successor behind.
import prisma from '../../config/database'
import {
  EmailVerificationToken,
  PasswordResetToken,
  Prisma,
  RefreshToken,
  User,
} from '@prisma/client'
import { PrismaTx } from '../../types/prisma'

// A DELETE only sees rows committed when it started. When it waits for a rotation holding a
// lock on one of those rows, that rotation commits its successor afterwards, unseen; the next
// pass removes it. Rotations that start later find their row gone and issue nothing, so the
// loop ends after one pass per rotation that was in flight.
const MAX_REVOCATION_PASSES = 10

async function revokeRefreshTokens(
  db: PrismaTx,
  where: Prisma.RefreshTokenWhereInput,
): Promise<Prisma.BatchPayload> {
  let removed = 0
  for (let pass = 0; pass < MAX_REVOCATION_PASSES; pass++) {
    const { count } = await db.refreshToken.deleteMany({ where })
    if (count === 0) return { count: removed }
    removed += count
  }
  // Never report success while a session may survive; callers roll back or return 500.
  throw new Error('Refresh-token revocation did not converge')
}

// This repository handles all database interactions related to authentication.
class AuthRepository {
  async findUserByEmail(
    email: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        email: email,
        deletedAt: null,
      },
    })
  }

  // Registration OTP: any active account whose email equals `email` regardless of case.
  // Prisma's insensitive `equals` becomes ILIKE with the value unescaped, where `_` and `%`
  // are wildcards (john_doe@ would match johnXdoe@), so compare lower() exactly instead. Like
  // the exact lookup this scans users (no email index yet); the OTP endpoints are rate limited.
  async findUserByEmailInsensitive(
    email: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<{ id: number } | null> {
    const db = txOrPrisma || prisma
    const rows = (await db.$queryRaw(Prisma.sql`
      SELECT "id" FROM "users"
      WHERE lower("email") = lower(${email}) AND "deleted_at" IS NULL
      LIMIT 1
    `)) as { id: number }[]
    return rows[0] ?? null
  }

  // REGISTRATION_DEFAULT_ROLE lookup; slugs are unique among active roles.
  async findActiveRoleIdBySlug(
    slug: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<number | null> {
    const db = txOrPrisma || prisma
    const role = await db.role.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    })
    return role?.id ?? null
  }

  async createUser(
    userData: Prisma.UserUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User> {
    const db = txOrPrisma || prisma
    return await db.user.create({
      data: userData,
    })
  }

  async createRefreshToken(
    tokenData: Prisma.RefreshTokenUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<RefreshToken> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.create({
      data: tokenData,
    })
  }

  // `token` is the SHA-256 hash; the unique index serves the lookup.
  async findRefreshToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<RefreshToken | null> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.findUnique({
      where: {
        token: token,
      },
    })
  }

  // Rotation claim: exactly one concurrent caller turns rotated_at from NULL to a time. A
  // loser blocks on the winner's row lock and, once the winner commits, matches no row.
  async markRefreshTokenRotated(
    id: string,
    successorCiphertext: Uint8Array,
    rotatedAt: Date,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<boolean> {
    const db = txOrPrisma || prisma
    const { count } = await db.refreshToken.updateMany({
      where: { id, rotatedAt: null },
      data: { rotatedAt, successorCiphertext },
    })
    return count === 1
  }

  // deleteMany: a row already removed by a concurrent request is not an error.
  async deleteRefreshToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Prisma.BatchPayload> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.deleteMany({
      where: {
        token: token,
      },
    })
  }

  // Revokes one login session: every token ever issued in it, rotated or live.
  async deleteRefreshTokenFamily(
    userId: number,
    familyId: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Prisma.BatchPayload> {
    return await revokeRefreshTokens(txOrPrisma || prisma, { userId, familyId })
  }

  async createEmailVerificationToken(
    tokenData: Prisma.EmailVerificationTokenUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<EmailVerificationToken> {
    const db = txOrPrisma || prisma
    return await db.emailVerificationToken.create({
      data: tokenData,
    })
  }

  async createPasswordResetToken(
    tokenData: Prisma.PasswordResetTokenUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<PasswordResetToken> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.create({
      data: tokenData,
    })
  }

  // Earlier unused reset links stop working once a new one is issued; used tokens stay
  // until the expiry cleanup removes them.
  async deleteUnusedPasswordResetTokens(
    userId: number,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Prisma.BatchPayload> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
    })
  }

  async findUniqueToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<PasswordResetToken | null> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.findUnique({
      where: {
        token: token,
      },
    })
  }

  // deleteMany: a row already removed by a concurrent request is not an error.
  async deletePasswordResetToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Prisma.BatchPayload> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.deleteMany({
      where: {
        token: token,
      },
    })
  }

  async updatePasswordResetToken(
    token: string,
    data: Prisma.PasswordResetTokenUpdateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<PasswordResetToken> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.update({
      where: {
        token: token,
      },
      data: data,
    })
  }

  // Revokes every session of the user (password change/reset, account deletion); served by
  // the (user_id, family_id) index.
  async deleteRefreshTokensByUserId(
    userId: number,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Prisma.BatchPayload> {
    return await revokeRefreshTokens(txOrPrisma || prisma, { userId })
  }

  // Retention: rotated rows are kept until they expire (reuse detection), so the table holds
  // one row per refresh. Delete expired rows oldest first in short batches on the expires_at
  // index; each batch is its own statement, so locks stay short. Returns rows removed.
  async deleteExpiredRefreshTokens(
    before: Date,
    batchSize = 1_000,
    maxBatches = 100,
  ): Promise<number> {
    let removed = 0
    for (let batch = 0; batch < maxBatches; batch++) {
      // Same stable plan as outbox retention: index-ordered batch, then primary-key lookups.
      const deleted = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "refresh_tokens"
        WHERE "id" = ANY(ARRAY(
          SELECT "id" FROM "refresh_tokens"
          WHERE "expires_at" < ${before}
          ORDER BY "expires_at"
          LIMIT ${batchSize}
        ))
      `)
      removed += deleted
      if (deleted < batchSize) break
    }
    return removed
  }
}

export default new AuthRepository()
