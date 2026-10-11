// Purpose: Verify registration OTP primitives: normalized emails, code format, keyed code hashes
//   bound to the email, and registration tickets bound to one verification.
// Caller: Node unit runner.
// Dependencies: src/modules/otp/otp.code.
// Main Functions: Code, hash and ticket cases.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  otpCodeMatches,
  registrationTicket,
  ticketMatches,
} from '../../src/modules/otp/otp.code'

test('otp code: six random digits; emails are trimmed and lowercased', () => {
  const codes = Array.from({ length: 50 }, generateOtpCode)
  for (const code of codes) assert.match(code, /^\d{6}$/)
  assert.ok(new Set(codes).size > 1)
  assert.equal(normalizeEmail('  Ann.Lee@Example.INVALID '), 'ann.lee@example.invalid')
})

test('otp hash: keyed by the server secret and bound to the email, unlike a bare SHA-256', () => {
  const hash = hashOtpCode('a@example.invalid', '123456')
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.notEqual(hash, crypto.createHash('sha256').update('123456').digest('hex'))
  assert.equal(otpCodeMatches('a@example.invalid', '123456', hash), true)
  assert.equal(otpCodeMatches('a@example.invalid', '123457', hash), false)
  assert.equal(otpCodeMatches('b@example.invalid', '123456', hash), false)
  assert.notEqual(hashOtpCode('a@example.invalid', '123456', 'another-secret'), hash)
  assert.equal(otpCodeMatches('a@example.invalid', '123456', 'abcd'), false)
})

test('registration ticket: stable for one verification, different for any other', () => {
  const verifiedAt = new Date('2026-10-11T10:00:00.123Z')
  const ticket = registrationTicket('otp-1', verifiedAt)
  assert.equal(registrationTicket('otp-1', new Date(verifiedAt)), ticket)
  assert.equal(ticketMatches(ticket, 'otp-1', verifiedAt), true)
  assert.equal(ticketMatches(ticket, 'otp-2', verifiedAt), false)
  assert.equal(ticketMatches(ticket, 'otp-1', new Date(verifiedAt.getTime() + 1)), false)
  assert.equal(ticketMatches(`${ticket}x`, 'otp-1', verifiedAt), false)
  assert.notEqual(registrationTicket('otp-1', verifiedAt, 'another-secret'), ticket)
})
