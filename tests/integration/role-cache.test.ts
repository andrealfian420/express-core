// Purpose: Verify RBAC cache invalidation after role and user changes: tracked users lose their
//   cached access and profile in one call, users tracked concurrently stay tracked, a request
//   that caches pre-change data while the change commits cannot keep stale access, and
//   invalidation failures are reported instead of escaping as unhandled rejections.
// Caller: Node integration runner.
// Dependencies: RBAC middleware, role/user services, cache service, isolated Redis/PostgreSQL,
//   fixtures.
// Main Functions: Role update/delete invalidation and stale-write race cases.
// Side Effects: Writes isolated role/user rows and Redis keys; mocks are restored per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor } from '../support/integration'
import roleService from '../../src/modules/role/role.service'
import userService from '../../src/modules/user/user.service'
import cacheService from '../../src/services/cache.service'
import checkPermission from '../../src/middleware/rbac.middleware'
import { PERMISSIONS } from '../../src/modules/role/role.permissions'
import AppError from '../../src/utils/appError'
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

const permission = PERMISSIONS.DATA_MASTER.USER.INDEX

// Runs the RBAC middleware alone; returns 'ok' or the rejection status.
async function check(userId: number): Promise<'ok' | number> {
  let failure: unknown
  await checkPermission(permission)(
    { user: { sub: userId } } as any,
    {} as any,
    (error?: unknown) => {
      failure = error
    },
  )
  return failure ? (failure as AppError).statusCode : 'ok'
}

// Commits `change` after the middleware read the database and before it caches that read: the
// interleaving in which deleting cache keys alone cannot help.
function changeBeforeCacheWrite(t: { mock: any }, userId: number, change: () => Promise<unknown>) {
  const set = cacheService.set.bind(cacheService)
  let fired = false
  t.mock.method(cacheService, 'set', async (key: string, value: unknown, ttl?: number) => {
    if (!fired && key === `user-role:${userId}`) {
      fired = true
      await change()
    }
    return await set(key, value, ttl)
  })
}

test('rbac cache: a role change committed while a request caches the old role applies at once (regression)', async (t) => {
  const admin = await actor()
  const { user, role } = await actor([permission])
  changeBeforeCacheWrite(t, user.id, () =>
    roleService.updateRole(role.slug, { access: [] }, admin.user.id),
  )
  // This request read the role before the change, so it is still allowed.
  assert.equal(await check(user.id), 'ok')
  t.mock.restoreAll()
  // Before the fix the entry it cached kept the old access for up to 5 minutes.
  assert.equal(await check(user.id), 403)
})

test('rbac cache: a user deleted while a request caches their access loses it at once (regression)', async (t) => {
  const admin = await actor()
  const { user } = await actor([permission])
  changeBeforeCacheWrite(t, user.id, () => userService.deleteUser(user.slug!, admin.user.id))
  assert.equal(await check(user.id), 'ok')
  t.mock.restoreAll()
  assert.equal(await check(user.id), 401)
})
