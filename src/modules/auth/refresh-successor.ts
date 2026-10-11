// Purpose: Seal and open the successor of a rotated refresh token, so requests that present
//   the predecessor within the grace window converge on the same successor without the
//   database ever holding a usable token.
// Caller: auth/refresh-rotation.ts.
// Dependencies: node:crypto (HKDF-SHA256, AES-256-GCM), config/env (JWT_ACCESS_SECRET).
// Main Functions: sealSuccessor, openSuccessor.
// Side Effects: None.
// Notes: The key is derived from the predecessor's plaintext token, which the database never
//   stores (only its SHA-256), with the server secret as HKDF salt: the row alone, or the row
//   plus a stolen old token, cannot recover the successor. Each seal uses a random IV, and the
//   predecessor hash is authenticated as associated data, so a ciphertext opens only on its own
//   row. Rotating JWT_ACCESS_SECRET only strands successors sealed in the last grace window.
import crypto from 'node:crypto'
import { env } from '../../config/env'

const VERSION = 1
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES
const INFO = 'express-core:refresh-successor:v1'

function deriveKey(predecessorToken: string, secret: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', predecessorToken, secret, INFO, 32))
}

// Successors come from utils/token generateToken (64 random bytes as hex) and are sealed as
// raw bytes: version | iv | tag | ciphertext, 93 bytes in total.
export function sealSuccessor(
  predecessorToken: string,
  predecessorHash: string,
  successorToken: string,
  secret: string = env.JWT_ACCESS_SECRET,
): Buffer {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    deriveKey(predecessorToken, secret),
    iv,
    { authTagLength: TAG_BYTES },
  )
  cipher.setAAD(Buffer.from(predecessorHash))
  const body = Buffer.concat([
    cipher.update(Buffer.from(successorToken, 'hex')),
    cipher.final(),
  ])
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body])
}

// Returns null when the ciphertext does not open (other token, other row, changed secret or
// corrupted data); callers treat that as an invalid refresh token.
export function openSuccessor(
  predecessorToken: string,
  predecessorHash: string,
  sealed: Uint8Array,
  secret: string = env.JWT_ACCESS_SECRET,
): string | null {
  const data = Buffer.from(sealed)
  if (data.length <= HEADER_BYTES || data[0] !== VERSION) return null
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(predecessorToken, secret),
      data.subarray(1, 1 + IV_BYTES),
      { authTagLength: TAG_BYTES },
    )
    decipher.setAAD(Buffer.from(predecessorHash))
    decipher.setAuthTag(data.subarray(1 + IV_BYTES, HEADER_BYTES))
    return Buffer.concat([
      decipher.update(data.subarray(HEADER_BYTES)),
      decipher.final(),
    ]).toString('hex')
  } catch {
    return null
  }
}
