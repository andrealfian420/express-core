// Purpose: Registration OTP primitives: code generation, email normalization, and the keyed
//   hashes that store codes and prove a verification (registration ticket).
// Caller: otp.service, dead-letter.service (re-drive guard), tests.
// Dependencies: node:crypto (randomInt, HKDF, HMAC-SHA256), config/env (JWT_ACCESS_SECRET).
// Main Functions: normalizeEmail, generateOtpCode, hashOtpCode, otpCodeMatches,
//   registrationTicket, ticketMatches, OTP_DIGITS.
// Side Effects: None.
// Notes: A plain SHA-256 of a 6-digit code falls to a million guesses offline, so codes are
//   stored as HMACs under a key derived from the server secret and bound to the email. The
//   ticket is an HMAC of the row id and its verification time: recomputable (no plaintext
//   stored), unique per verification, and unforgeable without the server secret.
import crypto from 'node:crypto'
import { env } from '../../config/env'

export const OTP_DIGITS = 6

function key(purpose: string, secret: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', secret, '', `express-core:${purpose}:v1`, 32))
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function generateOtpCode(): string {
  return crypto.randomInt(0, 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, '0')
}

// `email` must already be normalized.
export function hashOtpCode(
  email: string,
  code: string,
  secret: string = env.JWT_ACCESS_SECRET,
): string {
  return crypto.createHmac('sha256', key('otp-code', secret)).update(`${email}\n${code}`).digest('hex')
}

export function otpCodeMatches(email: string, code: string, storedHash: string): boolean {
  return equal(Buffer.from(hashOtpCode(email, code), 'hex'), Buffer.from(storedHash, 'hex'))
}

export function registrationTicket(
  otpId: string,
  verifiedAt: Date,
  secret: string = env.JWT_ACCESS_SECRET,
): string {
  return crypto
    .createHmac('sha256', key('otp-ticket', secret))
    .update(`${otpId}\n${verifiedAt.toISOString()}`)
    .digest('base64url')
}

export function ticketMatches(ticket: string, otpId: string, verifiedAt: Date): boolean {
  return equal(Buffer.from(ticket), Buffer.from(registrationTicket(otpId, verifiedAt)))
}
