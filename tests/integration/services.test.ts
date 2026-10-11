// Purpose: Protect cache, readiness, maintenance cleanup and audit-log persistence behavior.
// Caller: Node integration runner.
// Dependencies: Cache/system services, auth repository (refresh retention), Prisma, isolated
//   Redis, HTTP helper, actor fixtures.
// Main Functions: Stateful shared-service regression cases (cache multi-key read/delete,
//   counters and member removal, batched refresh-token retention).
// Side Effects: Writes only isolated test records and cache keys.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db } from '../support/integration'
import cache from '../../src/services/cache.service'
import system from '../../src/services/system.service'
import authRepository from '../../src/modules/auth/auth.repository'
import redis from '../../src/config/redis'
import prisma from '../../src/config/database'
import { api } from '../support/http'

setupIntegration()

test('cache: structured values, TTL, explicit invalidation and expiring member sets', async () => {
  assert.equal(await cache.get('missing'), null)
  await cache.set('fixture', { ok: true, n: 1 }, 60)
  assert.deepEqual(await cache.get('fixture'), { ok: true, n: 1 })
  const ttl = await redis.ttl('fixture')
  assert.ok(ttl > 0 && ttl <= 60)
  await cache.del('fixture')
  assert.equal(await cache.get('fixture'), null)
  await cache.sadd('members', 1, 30)
  await cache.sadd('members', 2, 30)
  assert.deepEqual((await cache.smembers('members')).sort(), ['1', '2'])
  assert.ok((await redis.ttl('members')) > 0)

  // Several keys in one call; srem removes only the named members.
  await cache.set('first', 1, 60)
  await cache.set('second', 2, 60)
  await cache.del('first', 'second', 'never-set')
  await cache.del()
  assert.equal(await redis.exists('first', 'second'), 0)
  await cache.sadd('members', 3, 30)
  assert.equal(await cache.srem('members', [1, 3, 99]), 2)
  assert.equal(await cache.srem('members', []), 0)
  assert.deepEqual(await cache.smembers('members'), ['2'])

  // mget parses like get(), keeping positions; incr counts from 1 without expiry.
  await cache.set('object', { a: 1 }, 60)
  assert.deepEqual(await cache.mget('object', 'missing'), [{ a: 1 }, null])
  assert.equal(await cache.incr('counter'), 1)
  assert.equal(await cache.incr('counter'), 2)
  assert.deepEqual(await cache.mget('counter'), [2])
  assert.equal(await redis.ttl('counter'), -1)
})

test('health: readiness returns 503 when either dependency fails', async (t) => {
  await api('get', '/health/ready').expect(200)
  const ping = t.mock.method(redis, 'ping', async () => {
    throw new Error('Unavailable')
  })
  await api('get', '/health/ready').expect(503)
  ping.mock.restore()
  t.mock.method(prisma, '$queryRaw', async () => {
    throw new Error('Unavailable')
  })
  await api('get', '/health/ready').expect(503)
})

test('system: cleanup removes only expired refresh, verification and reset tokens', async () => {
  const { user } = await actor()
  const past = new Date(Date.now() - 1000)
  const future = new Date(Date.now() + 3600_000)
  for (const [token, expiresAt] of [
    ['expired', past],
    ['valid', future],
  ] as const) {
    await db.refreshToken.create({ data: { token, userId: user.id, expiresAt } })
    await db.emailVerificationToken.create({ data: { token, userId: user.id, expiresAt } })
    await db.passwordResetToken.create({ data: { token, userId: user.id, expiresAt } })
  }
  await system.cleanupExpiredTokens()
  for (const rows of [
    await db.refreshToken.findMany(),
    await db.emailVerificationToken.findMany(),
    await db.passwordResetToken.findMany(),
  ])
    assert.deepEqual(
      rows.map((r) => r.token),
      ['valid'],
    )
})

test('system: expired refresh tokens go in bounded batches; rotated tokens stay until they expire', async () => {
  const { user } = await actor()
  const past = new Date(Date.now() - 1000)
  const future = new Date(Date.now() + 3600_000)
  for (const [token, expiresAt, rotatedAt] of [
    ['expired-1', past, null],
    ['expired-2', past, new Date()],
    ['expired-3', past, null],
    ['rotated', future, new Date(Date.now() - 86_400_000)],
    ['live', future, null],
  ] as const)
    await db.refreshToken.create({ data: { token, userId: user.id, expiresAt, rotatedAt } })
  assert.equal(await authRepository.deleteExpiredRefreshTokens(new Date(), 2), 3)
  assert.deepEqual(
    (await db.refreshToken.findMany({ orderBy: { token: 'asc' } })).map((r) => r.token),
    ['live', 'rotated'],
  )
})

test('system: activity log persists actor, subject and before/after snapshots', async () => {
  const { user } = await actor()
  await system.logActivity(user.id, 'update', 'User', user.id, null, { name: 'Old' }, { name: 'New' })
  const log = await db.activityLog.findFirstOrThrow()
  assert.equal(log.action, 'UPDATE')
  assert.equal(log.description, 'Update data User')
  assert.deepEqual(log.oldData, { name: 'Old' })
  assert.deepEqual(log.newData, { name: 'New' })
})
