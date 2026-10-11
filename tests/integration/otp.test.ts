// Purpose: Prove registration OTP against real persistence: codes stored as keyed hashes with a
//   resend cooldown, a hard attempt limit under parallel guessing, tickets that bind
//   registration to the verification, single consumption, the registration window, the
//   default role for both registration modes, and OTP cleanup.
// Caller: Node integration runner.
// Dependencies: OTP and auth services, registration settings (mocked per test), system
//   service, Prisma, fixtures, isolated PostgreSQL/Redis.
// Main Functions: Send/verify/register/default-role/cleanup cases.
// Side Effects: Writes isolated user, role, OTP and outbox rows; mocks are restored per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db, password } from '../support/integration'
import otpService from '../../src/modules/otp/otp.service'
import auth from '../../src/modules/auth/auth.service'
import system from '../../src/services/system.service'
import logger from '../../src/config/logger'
import { registrationSettings } from '../../src/modules/auth/registration.settings'
import { otpCodeMatches, registrationTicket } from '../../src/modules/otp/otp.code'
import { env } from '../../src/config/env'

setupIntegration()

const otpMode = (t: { mock: any }) => t.mock.method(registrationSettings, 'mode', () => 'otp')

// The code only exists in the queued email intent.
async function sentCodes(email: string): Promise<string[]> {
  const intents = await db.outbox.findMany({
    where: { jobName: 'sendOtpEmail' },
    orderBy: { id: 'asc' },
  })
  return intents
    .map((intent) => intent.payload as { email: string; code: string })
    .filter((payload) => payload.email === email)
    .map((payload) => payload.code)
}

async function verified(email: string) {
  await otpService.sendCode(email)
  const [code] = await sentCodes(email)
  return await otpService.verifyCode(email, code)
}

const register = (email: string, registrationToken?: string, name = 'New User') =>
  auth.register({ name, email, password, registrationToken })

test('otp send: stores only a keyed hash, queues the email and enforces the resend cooldown', async () => {
  await otpService.sendCode('  New@Example.INVALID ')
  const email = 'new@example.invalid'
  const row = await db.emailOtp.findUniqueOrThrow({ where: { email } })
  const [code] = await sentCodes(email)
  assert.match(code, /^\d{6}$/)
  assert.notEqual(row.codeHash, code)
  assert.equal(otpCodeMatches(email, code, row.codeHash), true)
  assert.equal(row.attempts, 0)
  const intent = await db.outbox.findFirstOrThrow()
  assert.deepEqual(intent.payload, { email, code, expiresMinutes: env.OTP_EXPIRES_MINUTES })

  await assert.rejects(() => otpService.sendCode(email), /Please wait before requesting a new code/)
  assert.equal(await db.outbox.count(), 1)

  await db.emailOtp.update({
    where: { email },
    data: { sentAt: new Date(Date.now() - (env.OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000), attempts: 3 },
  })
  await otpService.sendCode(email)
  const replaced = await db.emailOtp.findUniqueOrThrow({ where: { email } })
  assert.equal(replaced.id, row.id)
  assert.equal(replaced.attempts, 0)
  assert.equal((await sentCodes(email)).length, 2)
  assert.equal(await db.emailOtp.count(), 1)
})

test('otp send: an address that already has an account, in any letter case, is refused', async () => {
  const { user } = await actor()
  await assert.rejects(() => otpService.sendCode(user.email!.toUpperCase()), /Email already registered/)
  assert.equal(await db.emailOtp.count(), 0)
  assert.equal(await db.outbox.count(), 0)

  // `_` and `%` are ordinary characters, not LIKE wildcards matching another account.
  await db.user.update({ where: { id: user.id }, data: { email: 'johnXdoe@example.invalid' } })
  await otpService.sendCode('john_doe@example.invalid')
  await otpService.sendCode('john%@example.invalid')
  assert.equal(await db.emailOtp.count(), 2)
})

test('otp verify: parallel wrong guesses never exceed the attempt limit', async () => {
  const email = 'guess@example.invalid'
  await otpService.sendCode(email)
  const [code] = await sentCodes(email)
  const wrong = code === '000000' ? '000001' : '000000'
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => otpService.verifyCode(email, wrong)),
  )
  assert.ok(results.every((result) => result.status === 'rejected'))
  // Each try reserves an attempt before comparing, so at most OTP_MAX_ATTEMPTS were checked.
  assert.equal(
    (await db.emailOtp.findUniqueOrThrow({ where: { email } })).attempts,
    env.OTP_MAX_ATTEMPTS,
  )
  await assert.rejects(() => otpService.verifyCode(email, code), /Too many attempts/)
})

test('otp verify: a correct code returns a ticket (the same on repeat); wrong and expired codes are refused', async () => {
  const email = 'ticket@example.invalid'
  await otpService.sendCode(email)
  const [code] = await sentCodes(email)
  await assert.rejects(() => otpService.verifyCode(email, '999999' === code ? '999998' : '999999'), /Invalid code/)
  const ticket = await otpService.verifyCode(email, code)
  assert.equal(await otpService.verifyCode(email, code), ticket)
  const row = await db.emailOtp.findUniqueOrThrow({ where: { email } })
  assert.equal(ticket, registrationTicket(row.id, row.verifiedAt!))
  assert.equal(row.attempts, 3)

  await db.emailOtp.update({ where: { email }, data: { expiresAt: new Date(Date.now() - 1000) } })
  await assert.rejects(() => otpService.verifyCode(email, code), /Invalid or expired code/)
  await assert.rejects(() => otpService.verifyCode('nobody@example.invalid', code), /Invalid or expired code/)
})

test('otp register: needs the ticket, creates a verified account once and sends no link', async (t) => {
  otpMode(t)
  const email = 'join@example.invalid'
  const ticket = await verified(email)

  await assert.rejects(() => register(email), /Email not verified/)
  await assert.rejects(() => register(email, `${ticket}x`), /Email not verified/)
  // A refused attempt rolls its consumption back.
  assert.equal((await db.emailOtp.findUniqueOrThrow({ where: { email } })).consumedAt, null)

  const results = await Promise.allSettled([
    register(email, ticket, 'First'),
    register(email, ticket, 'Second'),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected'])
  const user = await db.user.findFirstOrThrow({ where: { email } })
  assert.equal(user.isEmailVerified, true)
  assert.equal(user.roleId, null)
  assert.equal(await db.user.count({ where: { email } }), 1)
  assert.ok((await db.emailOtp.findUniqueOrThrow({ where: { email } })).consumedAt)
  assert.equal(await db.emailVerificationToken.count(), 0)
  assert.equal(await db.outbox.count({ where: { jobName: 'sendVerificationEmail' } }), 0)

  await assert.rejects(() => register('JOIN@example.invalid', ticket), /Email already in use/)
  await auth.login(email, password)
})

test('otp register: a code verified before the registration window is refused', async (t) => {
  otpMode(t)
  const email = 'late@example.invalid'
  await verified(email)
  const verifiedAt = new Date(Date.now() - (env.OTP_VERIFIED_WINDOW_MINUTES * 60 + 1) * 1000)
  const row = await db.emailOtp.update({ where: { email }, data: { verifiedAt } })
  await assert.rejects(
    () => register(email, registrationTicket(row.id, verifiedAt)),
    /Email not verified/,
  )
  assert.equal(await db.user.count({ where: { email } }), 0)
})

test('registration default role: both modes assign REGISTRATION_DEFAULT_ROLE; an unknown slug refuses registration', async (t) => {
  const member = await db.role.create({
    data: { slug: 'member', title: 'Member', userType: 'Member' },
  })
  const slug = t.mock.method(registrationSettings, 'defaultRoleSlug', () => 'member')

  await register('linked@example.invalid')
  const linked = await db.user.findFirstOrThrow({ where: { email: 'linked@example.invalid' } })
  assert.equal(linked.roleId, member.id)
  assert.equal(linked.isEmailVerified, false)

  otpMode(t)
  await register('coded@example.invalid', await verified('coded@example.invalid'))
  assert.equal(
    (await db.user.findFirstOrThrow({ where: { email: 'coded@example.invalid' } })).roleId,
    member.id,
  )

  slug.mock.mockImplementation(() => 'missing')
  const errors = t.mock.method(logger, 'error', () => logger)
  const ticket = await verified('broken@example.invalid')
  await assert.rejects(() => register('broken@example.invalid', ticket), /Registration is temporarily unavailable/)
  assert.equal(await db.user.count({ where: { email: 'broken@example.invalid' } }), 0)
  assert.equal(errors.mock.calls[0].arguments[0], 'REGISTRATION_DEFAULT_ROLE does not match an active role')
})

test('otp cleanup: codes past expiry plus the registration window are removed, newer ones kept', async () => {
  const minutes = (n: number) => new Date(Date.now() - n * 60_000)
  for (const [email, expiresAt] of [
    ['old@example.invalid', minutes(env.OTP_VERIFIED_WINDOW_MINUTES + 1)],
    ['recent@example.invalid', minutes(env.OTP_VERIFIED_WINDOW_MINUTES - 1)],
  ] as const)
    await db.emailOtp.create({ data: { email, codeHash: 'x', expiresAt } })
  await system.cleanupExpiredTokens()
  assert.deepEqual(
    (await db.emailOtp.findMany()).map((row) => row.email),
    ['recent@example.invalid'],
  )
})
