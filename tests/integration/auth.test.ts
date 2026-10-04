// Purpose: Exercise authentication transactions and token lifecycles against real persistence.
// Caller: Node integration runner.
// Dependencies: Auth service, Prisma, isolated Redis/BullMQ email queue, actor fixtures.
// Main Functions: Registration/verification (token carried by the email job), login,
//   sequential refresh rotation, logout and password-reset lifecycle cases.
// Side Effects: Writes isolated identity, token and queue records.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db, password } from '../support/integration'
import auth from '../../src/modules/auth/auth.service'
import emailQueue from '../../src/jobs/queues/email.queue'
import { hashToken } from '../../src/utils/token'

setupIntegration()

test('auth: registration hashes the password, stores a verification token and queues the email with it', async () => {
  const email = 'register@example.invalid'
  const result = await auth.register({ name: 'Registered User', email, password })
  assert.deepEqual(Object.keys(result), ['user'])
  assert.equal((result.user as any).password, undefined)
  assert.equal(result.user.email, email)
  const user = await db.user.findFirstOrThrow({ where: { email } })
  assert.notEqual(user.password, password)
  assert.equal(user.isEmailVerified, false)
  assert.equal(user.slug, 'registered-user')
  const verification = await db.emailVerificationToken.findFirstOrThrow({
    where: { userId: user.id },
  })
  const jobs = await emailQueue.getWaiting()
  // Regression: the job used to carry `token: undefined` because the transaction dropped it.
  assert.deepEqual(
    jobs.map((j) => [j.name, j.data.email, j.data.token]),
    [['sendVerificationEmail', email, verification.token]],
  )
  await assert.rejects(
    () => auth.register({ name: 'Duplicate', email, password }),
    /already in use/,
  )
  assert.equal(await db.user.count({ where: { email } }), 1)
})

test('auth: unverified accounts cannot sign in; verification activates the account once', async () => {
  const email = 'verify@example.invalid'
  await auth.register({ name: 'Verify', email, password })
  await assert.rejects(() => auth.login(email, password), /verify/)
  const record = await db.emailVerificationToken.findFirstOrThrow()
  await assert.rejects(() => auth.verifyEmail('unknown-token'), /Invalid token/)
  await auth.verifyEmail(record.token)
  const user = await db.user.findFirstOrThrow({ where: { email } })
  assert.equal(user.isEmailVerified, true)
  assert.equal(await db.emailVerificationToken.count(), 0)
  await assert.rejects(() => auth.verifyEmail(record.token), /Invalid token/)
  const names = (await emailQueue.getWaiting()).map((j) => j.name).sort()
  assert.deepEqual(names, ['sendVerificationEmail', 'sendVerificationSuccessEmail'])
  const tokens = await auth.login(email, password)
  assert.ok(tokens.accessToken)
})

test('auth: expired verification token is rejected and the account stays inactive', async () => {
  const { user } = await actor()
  await db.user.update({ where: { id: user.id }, data: { isEmailVerified: false } })
  await db.emailVerificationToken.create({
    data: { token: 'expired-verification', userId: user.id, expiresAt: new Date(0) },
  })
  await assert.rejects(() => auth.verifyEmail('expired-verification'), /expired/)
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).isEmailVerified,
    false,
  )
})

test('auth: login stores only the refresh hash; sequential refresh rotates; logout revokes', async () => {
  const { user } = await actor()
  await assert.rejects(() => auth.login(user.email!, 'wrong'), /Invalid email or password/)
  await assert.rejects(() => auth.login('missing@example.invalid', password))
  const login = await auth.login(user.email!, password)
  const stored = await db.refreshToken.findFirstOrThrow({ where: { userId: user.id } })
  assert.equal(stored.token, hashToken(login.refreshToken))
  const rotated = await auth.refreshAccessToken(login.refreshToken)
  assert.notEqual(rotated.refreshToken, login.refreshToken)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 1)
  await assert.rejects(() => auth.refreshAccessToken(login.refreshToken), /Invalid refresh token/)
  await assert.rejects(() => auth.refreshAccessToken(''), /required/)
  await auth.logout(rotated.refreshToken)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
  await assert.rejects(() => auth.refreshAccessToken(rotated.refreshToken))
  await assert.rejects(() => auth.logout(rotated.refreshToken), /Invalid refresh token/)
})

test('auth: expired refresh token is rejected', async () => {
  const { user } = await actor()
  await db.refreshToken.create({
    data: { token: hashToken('expired-refresh'), userId: user.id, expiresAt: new Date(0) },
  })
  await assert.rejects(() => auth.refreshAccessToken('expired-refresh'), /expired/)
})

test('auth: password reset is single-use, expires and revokes refresh sessions', async () => {
  const { user } = await actor()
  await auth.requestPasswordReset('missing@example.invalid')
  assert.equal(await db.passwordResetToken.count(), 0)
  await auth.login(user.email!, password)
  await auth.requestPasswordReset(user.email!)
  const record = await db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })
  await auth.resetPassword(record.token, 'Changed2!')
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
  assert.ok((await db.passwordResetToken.findUniqueOrThrow({ where: { id: record.id } })).usedAt)
  await assert.rejects(() => auth.resetPassword(record.token, 'Another3!'), /already used/)
  await assert.rejects(() => auth.login(user.email!, password))
  await auth.login(user.email!, 'Changed2!')
  await db.passwordResetToken.create({
    data: { token: 'expired-reset', userId: user.id, expiresAt: new Date(0) },
  })
  await assert.rejects(() => auth.resetPassword('expired-reset', 'Another3!'), /expired/)
  await assert.rejects(() => auth.resetPassword('unknown-reset', 'Another3!'), /Invalid token/)
})
