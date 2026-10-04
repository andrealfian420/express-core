// Purpose: Exercise authentication transactions and token lifecycles against real persistence,
//   including the email intents they record in the transactional outbox.
// Caller: Node integration runner.
// Dependencies: Auth service, outbox repository, Prisma, isolated Redis/BullMQ email queue,
//   actor fixtures.
// Main Functions: Registration/verification/reset intents (atomic with the business write,
//   no Redis on the request path), login, sequential refresh rotation, logout and
//   password-reset lifecycle cases.
// Side Effects: Writes isolated identity, token and outbox records.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db, password } from '../support/integration'
import auth from '../../src/modules/auth/auth.service'
import outboxRepository from '../../src/modules/outbox/outbox.repository'
import emailQueue from '../../src/jobs/queues/email.queue'
import { hashToken } from '../../src/utils/token'

setupIntegration()

const intents = () =>
  db.outbox.findMany({
    orderBy: { id: 'asc' },
    select: { queueName: true, jobName: true, payload: true, status: true },
  })

test('auth: registration stores the user, its verification token and the email intent in one transaction', async () => {
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
  // Regression (T2): the email payload carries the stored token. Since T4 it is an outbox
  // intent; nothing reaches Redis on the request path.
  assert.deepEqual(await intents(), [
    {
      queueName: 'email',
      jobName: 'sendVerificationEmail',
      payload: { email, name: 'Registered User', token: verification.token },
      status: 'PENDING',
    },
  ])
  assert.equal(await emailQueue.count(), 0)
  await assert.rejects(
    () => auth.register({ name: 'Duplicate', email, password }),
    /already in use/,
  )
  assert.equal(await db.user.count({ where: { email } }), 1)
})

test('auth: registration succeeds and keeps its email intent while Redis rejects every command', async (t) => {
  // Regression: registration used to commit the user and then fail on the direct enqueue,
  // leaving an account whose verification email could never be sent.
  t.mock.method(emailQueue, 'add', async () => {
    throw new Error('Redis unavailable')
  })
  const result = await auth.register({ name: 'Offline', email: 'offline@example.invalid', password })
  assert.equal(result.user.email, 'offline@example.invalid')
  assert.deepEqual(
    (await intents()).map((intent) => [intent.jobName, intent.status]),
    [['sendVerificationEmail', 'PENDING']],
  )
})

test('auth: a failed intent write rolls back the registration and a failed business write leaves no intent', async (t) => {
  const enqueue = t.mock.method(outboxRepository, 'enqueue', async () => {
    throw new Error('Injected outbox failure')
  })
  await assert.rejects(
    () => auth.register({ name: 'Rolled Back', email: 'rollback@example.invalid', password }),
    /Injected outbox failure/,
  )
  enqueue.mock.restore()
  assert.equal(await db.user.count(), 0)
  assert.equal(await db.emailVerificationToken.count(), 0)

  const { user } = await actor()
  await assert.rejects(() =>
    auth.register({ name: 'Duplicate', email: user.email!, password }),
  )
  assert.equal(await db.outbox.count(), 0)
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
  assert.deepEqual(
    (await intents()).map((intent) => intent.jobName),
    ['sendVerificationEmail', 'sendVerificationSuccessEmail'],
  )
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

test('auth: a reset request records the email intent and only the newest token stays valid', async () => {
  const { user } = await actor()
  await auth.requestPasswordReset('missing@example.invalid')
  assert.equal(await db.passwordResetToken.count(), 0)
  assert.equal(await db.outbox.count(), 0)

  await auth.requestPasswordReset(user.email!)
  const first = await db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })
  await auth.requestPasswordReset(user.email!)
  const tokens = await db.passwordResetToken.findMany({ where: { userId: user.id } })
  assert.equal(tokens.length, 1)
  assert.notEqual(tokens[0].token, first.token)
  await assert.rejects(() => auth.resetPassword(first.token, 'Changed2!'), /Invalid token/)
  assert.deepEqual(
    (await intents()).map((intent) => [intent.jobName, (intent.payload as any).token]),
    [
      ['sendResetPasswordEmail', first.token],
      ['sendResetPasswordEmail', tokens[0].token],
    ],
  )
  assert.equal(await emailQueue.count(), 0)
})

test('auth: password reset is single-use, expires and revokes refresh sessions', async () => {
  const { user } = await actor()
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
