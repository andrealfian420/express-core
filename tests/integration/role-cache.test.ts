// Purpose: Verify RBAC cache invalidation after role changes: tracked users lose their cached
//   access and profile in one call, users tracked concurrently stay tracked, and failures of
//   the invalidation are reported instead of escaping as unhandled rejections.
// Caller: Node integration runner.
// Dependencies: Role service, cache service, isolated Redis/PostgreSQL, fixtures.
// Main Functions: Role update and delete invalidation cases.
// Side Effects: Writes isolated role/user rows and Redis keys; mocks are restored per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor } from '../support/integration'
import roleService from '../../src/modules/role/role.service'
import cacheService from '../../src/services/cache.service'
import redis from '../../src/config/redis'

setupIntegration()

async function trackedUser(roleId: number, userId: number) {
  await cacheService.set(`user-role:${userId}`, { id: userId, role: { id: roleId } }, 300)
  await cacheService.set(`profile:${userId}`, { id: userId }, 300)
  await cacheService.sadd(`role-users:${roleId}`, userId, 300)
}

test('role update: cached access of tracked users is dropped and concurrently tracked users stay tracked (regression)', async (t) => {
  const { role, user } = await actor()
  await trackedUser(role.id, user.id)
  const read = cacheService.smembers.bind(cacheService)
  const del = t.mock.method(cacheService, 'del')
  t.mock.method(cacheService, 'smembers', async (key: string) => {
    const members = await read(key)
    // Another request caches a user for this role right after the invalidation read the set.
    await redis.sadd(key, '999')
    return members
  })

  await roleService.updateRole(role.slug, { description: 'Changed' }, user.id)

  assert.equal(await redis.exists(`user-role:${user.id}`, `profile:${user.id}`), 0)
  // One round trip for all users' keys (plus the role key).
  const lastDel = del.mock.calls[del.mock.calls.length - 1]
  assert.deepEqual(lastDel.arguments, [`user-role:${user.id}`, `profile:${user.id}`])
  // Deleting the whole set used to forget user 999, so a later role change missed it.
  assert.deepEqual(await redis.smembers(`role-users:${role.id}`), ['999'])
})

test('role delete: invalidation is awaited, so a Redis failure is reported (regression)', async (t) => {
  const { user } = await actor()
  const create = (title: string) =>
    roleService.createRole(
      { slug: '', title, userType: 'Administrator', access: [] },
      user.id,
    )
  const role = await create('Temporary')
  await trackedUser(role.id, 4242)
  await roleService.deleteRole(role.slug, user.id)
  assert.equal(await redis.exists('user-role:4242', 'profile:4242', `role-users:${role.id}`), 0)

  const failing = await create('Failing')
  await trackedUser(failing.id, 4343)
  t.mock.method(cacheService, 'del', async () => {
    throw new Error('Connection is closed')
  })
  // Before T6 the deletes ran un-awaited inside forEach: the call resolved and the failure
  // escaped as an unhandled rejection.
  await assert.rejects(() => roleService.deleteRole(failing.slug, user.id), /Connection is closed/)
})
