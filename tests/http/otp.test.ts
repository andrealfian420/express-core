// Purpose: Verify the registration OTP HTTP contract: routes are absent in link mode, and in OTP
//   mode send → verify → register works end to end with validation and refusal statuses.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, registration settings (mocked per test), Prisma.
// Main Functions: Link-mode absence and OTP-mode flow cases.
// Side Effects: Writes isolated user, OTP and outbox rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, db, password } from '../support/integration'
import { api } from '../support/http'
import { registrationSettings } from '../../src/modules/auth/registration.settings'

setupIntegration()

const email = 'http-otp@example.invalid'

test('link mode (default): OTP routes do not exist and registration still sends a link', async () => {
  await api('post', '/auth/send-otp').send({ email }).expect(404)
  await api('post', '/auth/verify-otp').send({ email, code: '123456' }).expect(404)
  const registered = await api('post', '/auth/register')
    .send({ name: 'Link User', email, password })
    .expect(201)
  assert.match(registered.body.message, /check your email to verify/)
  assert.equal(await db.emailVerificationToken.count(), 1)
})

test('otp mode: send → verify → register over HTTP, with validation and refusals', async (t) => {
  t.mock.method(registrationSettings, 'mode', () => 'otp')
  await api('post', '/auth/send-otp').send({ email: 'not-an-email' }).expect(400)
  const sent = await api('post', '/auth/send-otp').send({ email }).expect(200)
  assert.equal(sent.body.data, null)
  await api('post', '/auth/send-otp').send({ email }).expect(429)

  const { code } = (await db.outbox.findFirstOrThrow()).payload as { code: string }
  await api('post', '/auth/verify-otp').send({ email, code: '12ab56' }).expect(400)
  const wrong = await api('post', '/auth/verify-otp')
    .send({ email, code: code === '000000' ? '000001' : '000000' })
    .expect(400)
  assert.equal(wrong.body.message, 'Invalid code')
  const verified = await api('post', '/auth/verify-otp').send({ email, code }).expect(200)
  const { registrationToken } = verified.body.data
  assert.equal(typeof registrationToken, 'string')
  assert.doesNotMatch(JSON.stringify(verified.body), new RegExp(code))

  await api('post', '/auth/register').send({ name: 'Coded User', email, password }).expect(400)
  const registered = await api('post', '/auth/register')
    .send({ name: 'Coded User', email, password, registrationToken })
    .expect(201)
  assert.match(registered.body.message, /You can now log in/)
  assert.equal(registered.body.data.user.isEmailVerified, true)
  await api('post', '/auth/login').send({ email, password }).expect(200)
  await api('post', '/auth/send-otp').send({ email }).expect(409)
})
