// Purpose: Prove refresh-token rotation under concurrency against real persistence: parallel and
//   retried requests converge on one successor, reuse after the grace window revokes only that
//   session family, rollbacks issue nothing, and logout/password reset leave no grace path.
// Caller: Node integration runner.
// Dependencies: Auth service, auth repository, cache service, logger, Prisma, actor fixtures,
//   isolated PostgreSQL/Redis.
// Main Functions: Parallel rotation, grace chain, reuse revocation, rollback, Redis failure,
//   logout and password-reset revocation cases, including revocation racing an in-flight
//   rotation (interleaving forced with a gate and observed through pg_stat_activity).
// Side Effects: Writes isolated identity and refresh-token rows; mocks are restored per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { setupIntegration, actor, db, password, waitFor } from '../support/integration'
import auth from '../../src/modules/auth/auth.service'
import authRepository from '../../src/modules/auth/auth.repository'
import cacheService from '../../src/services/cache.service'
import logger from '../../src/config/logger'
import { env } from '../../src/config/env'
import { hashToken } from '../../src/utils/token'

setupIntegration()

const row = (token: string) =>
  db.refreshToken.findUniqueOrThrow({ where: { token: hashToken(token) } })

// Moves a rotation into the past instead of waiting for the grace window to elapse.
const ageRotation = (token: string, seconds: number) =>
  db.refreshToken.update({
    where: { token: hashToken(token) },
    data: { rotatedAt: new Date(Date.now() - seconds * 1000) },
  })

async function login() {
  const { user } = await actor()
  return { user, ...(await auth.login(user.email!, password)) }
}

// Holds the next refresh inside its transaction after it has claimed the presented token
// (row lock held) and before it inserts the successor, until release() is called.
function pauseRotation(t: { mock: any }) {
  const insert = authRepository.createRefreshToken.bind(authRepository)
  let release!: () => void
  let reached!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const claimed = new Promise<void>((resolve) => (reached = resolve))
  t.mock.method(
    authRepository,
    'createRefreshToken',
    async (...args: Parameters<typeof insert>) => {
      reached()
      await gate
      return await insert(...args)
    },
  )
  return { claimed, release }
}

const lockWaiters = async () => {
  const [{ waiting }] = await db.$queryRaw<{ waiting: number }[]>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`
  return waiting
}

// Starts a refresh, lets `revoke` run while the rotation is uncommitted, then lets the
// rotation commit; the successor it issued must not survive the revocation.
async function raceRevocation(
  t: { mock: any },
  refreshToken: string,
  revoke: () => Promise<void>,
) {
  const { claimed, release } = pauseRotation(t)
  const refreshing = auth.refreshAccessToken(refreshToken)
  await claimed
  const revoking = revoke()
  try {
    await waitFor(async () => (await lockWaiters()) >= 1, 5_000)
  } finally {
    release()
  }
  const [{ refreshToken: successor }] = await Promise.all([refreshing, revoking])
  return successor
}

test('refresh: parallel refreshes with one token all receive the same successor (regression)', async () => {
  const { user, refreshToken } = await login()
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => auth.refreshAccessToken(refreshToken)),
  )
  // Before T5 the losers failed on the row the winner had deleted.
  assert.deepEqual(
    results.map((result) => result.status),
    Array(5).fill('fulfilled'),
  )
  const issued = results.map(
    (result) => (result as PromiseFulfilledResult<{ accessToken: string; refreshToken: string }>).value,
  )
  assert.equal(new Set(issued.map((tokens) => tokens.refreshToken)).size, 1)
  for (const { accessToken } of issued)
    assert.equal(
      (jwt.verify(accessToken, env.JWT_ACCESS_SECRET) as jwt.JwtPayload).sub,
      String(user.id),
    )

  const successor = issued[0].refreshToken
  assert.notEqual(successor, refreshToken)
  const [predecessor, live] = [await row(refreshToken), await row(successor)]
  assert.ok(predecessor.rotatedAt)
  assert.equal(live.rotatedAt, null)
  assert.equal(live.familyId, predecessor.familyId)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 2)
  // Only the sealed form is stored; neither encoding of the successor appears.
  const sealed = Buffer.from(predecessor.successorCiphertext!)
  assert.equal(sealed.includes(Buffer.from(successor, 'hex')), false)
  assert.equal(sealed.includes(Buffer.from(successor)), false)
})

test('refresh: a retry within the grace window returns the newest token of the chain', async () => {
  const { user, refreshToken } = await login()
  const first = await auth.refreshAccessToken(refreshToken)
  const second = await auth.refreshAccessToken(first.refreshToken)
  // A late request with the oldest token must not hand out the stale middle token.
  assert.equal((await auth.refreshAccessToken(refreshToken)).refreshToken, second.refreshToken)
  assert.equal((await auth.refreshAccessToken(first.refreshToken)).refreshToken, second.refreshToken)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 3)
  assert.equal((await row(second.refreshToken)).rotatedAt, null)
})

test('refresh: a chain longer than five rotations in one grace window is refused without revoking', async () => {
  const { refreshToken } = await login()
  let latest = refreshToken
  for (let i = 0; i < 6; i++) latest = (await auth.refreshAccessToken(latest)).refreshToken
  await assert.rejects(() => auth.refreshAccessToken(refreshToken), /Invalid refresh token/)
  assert.equal(await db.refreshToken.count(), 7)
  await auth.refreshAccessToken(latest)
})

test('refresh: reuse after the grace window revokes that session family only, and the revocation commits', async (t) => {
  const warn = t.mock.method(logger, 'warn', () => logger)
  const { user, refreshToken } = await login()
  const other = await auth.login(user.email!, password)
  const { refreshToken: successor } = await auth.refreshAccessToken(refreshToken)
  const { familyId } = await row(successor)

  await ageRotation(refreshToken, env.REFRESH_GRACE_SECONDS - 2)
  assert.equal((await auth.refreshAccessToken(refreshToken)).refreshToken, successor)

  await ageRotation(refreshToken, env.REFRESH_GRACE_SECONDS + 1)
  await assert.rejects(() => auth.refreshAccessToken(refreshToken), /Invalid refresh token/)
  assert.equal(await db.refreshToken.count({ where: { familyId } }), 0)
  await assert.rejects(() => auth.refreshAccessToken(successor), /Invalid refresh token/)
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments),
    [[
      'Refresh token reused after its grace window; session revoked',
      { userId: user.id, familyId },
    ]],
  )

  // The user's other login is a different family and keeps working.
  await auth.refreshAccessToken(other.refreshToken)
})

test('refresh: a failure before commit issues nothing and leaves the token usable', async (t) => {
  const { refreshToken } = await login()
  const insert = t.mock.method(authRepository, 'createRefreshToken', async () => {
    throw new Error('successor insert failed')
  })
  await assert.rejects(() => auth.refreshAccessToken(refreshToken), /successor insert failed/)
  insert.mock.restore()

  const untouched = await row(refreshToken)
  assert.equal(untouched.rotatedAt, null)
  assert.equal(untouched.successorCiphertext, null)
  assert.equal(await db.refreshToken.count(), 1)
  const rotated = await auth.refreshAccessToken(refreshToken)
  assert.equal((await row(rotated.refreshToken)).rotatedAt, null)
})

test('refresh/logout: a Redis outage changes nothing; logout still revokes the session in the database (regression)', async (t) => {
  const down = async () => {
    throw new Error('Connection is closed')
  }
  for (const method of ['get', 'set', 'del'] as const)
    t.mock.method(cacheService, method, down)
  const warn = t.mock.method(logger, 'warn', () => logger)

  const { user, refreshToken } = await login()
  const [a, b] = await Promise.all([
    auth.refreshAccessToken(refreshToken),
    auth.refreshAccessToken(refreshToken),
  ])
  assert.equal(a.refreshToken, b.refreshToken)

  // Before T5 the cache call ran first, so logout failed and the session stayed alive.
  await auth.logout(a.refreshToken)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
  assert.equal(
    warn.mock.calls.filter(
      (call) =>
        (call.arguments as unknown[])[0] ===
        'Could not invalidate the cached profile after logout',
    ).length,
    1,
  )
})

test('logout: revokes the whole family, even through a predecessor still in its grace window', async () => {
  const { user, refreshToken } = await login()
  const other = await auth.login(user.email!, password)

  const { refreshToken: successor } = await auth.refreshAccessToken(refreshToken)
  await auth.logout(successor)
  // Without family revocation the predecessor would still open the deleted successor.
  await assert.rejects(() => auth.refreshAccessToken(refreshToken), /Invalid refresh token/)

  const { refreshToken: otherSuccessor } = await auth.refreshAccessToken(other.refreshToken)
  await auth.logout(other.refreshToken)
  await assert.rejects(() => auth.refreshAccessToken(otherSuccessor), /Invalid refresh token/)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
})

test('password reset: revokes every family, including grace successors', async () => {
  const { user, refreshToken } = await login()
  const { refreshToken: successor } = await auth.refreshAccessToken(refreshToken)
  await auth.requestPasswordReset(user.email!)
  const reset = await db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })
  await auth.resetPassword(reset.token, 'Changed2!')
  for (const token of [refreshToken, successor])
    await assert.rejects(() => auth.refreshAccessToken(token), /Invalid refresh token/)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
})

test('logout racing an in-flight rotation leaves no live successor (regression)', async (t) => {
  const { user, refreshToken } = await login()
  const successor = await raceRevocation(t, refreshToken, () => auth.logout(refreshToken))
  // A single DELETE missed the successor committed while it waited on the claimed row.
  await assert.rejects(() => auth.refreshAccessToken(successor), /Invalid refresh token/)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
})

test('password reset racing an in-flight rotation leaves no live successor (regression)', async (t) => {
  const { user, refreshToken } = await login()
  await auth.requestPasswordReset(user.email!)
  const reset = await db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } })
  const successor = await raceRevocation(t, refreshToken, () =>
    auth.resetPassword(reset.token, 'Changed2!'),
  )
  await assert.rejects(() => auth.refreshAccessToken(successor), /Invalid refresh token/)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
})
