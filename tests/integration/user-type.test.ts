// Purpose: Prove the user-type gate against real persistence and the versioned RBAC cache:
//   allowed and denied types, users without a role, deleted users, refusal of unknown types
//   when routes are defined, one role lookup for chained gates, role type changes applying on
//   the next request, and cache entries written before roles carried userType being refilled.
// Caller: Node integration runner.
// Dependencies: user-type and RBAC middleware, role/user services, cache and rbac-cache
//   services, fixtures, isolated PostgreSQL/Redis.
// Main Functions: Gate matrix, startup refusal, chained gates, type change and legacy cache cases.
// Side Effects: Writes isolated role/user rows and Redis keys; mocks are restored per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db } from '../support/integration'
import checkUserType from '../../src/middleware/user-type.middleware'
import checkPermission from '../../src/middleware/rbac.middleware'
import roleService from '../../src/modules/role/role.service'
import userService from '../../src/modules/user/user.service'
import cacheService from '../../src/services/cache.service'
import { RBAC_VERSION_KEY } from '../../src/services/rbac-cache.service'
import { PERMISSIONS } from '../../src/modules/role/role.permissions'
import { UserType } from '../../src/modules/role/role.user-types'
import AppError from '../../src/utils/appError'
import redis from '../../src/config/redis'

setupIntegration()

type Gate = (req: any, res: any, next: (error?: unknown) => void) => Promise<unknown>

// Runs the gates in order on one request, as Express would; returns 'ok' or "<status> <message>".
async function run(userId: number | undefined, ...gates: Gate[]): Promise<string> {
  const req: any = { user: userId === undefined ? undefined : { sub: userId } }
  for (const gate of gates) {
    let failure: unknown
    await gate(req, {}, (error?: unknown) => {
      failure = error
    })
    if (failure) return `${(failure as AppError).statusCode} ${(failure as AppError).message}`
  }
  return 'ok'
}

const memberOnly = checkUserType('Member')
const permission = PERMISSIONS.DATA_MASTER.USER.INDEX

test('user-type gate: allows listed types; denies other types, users without a role, deleted and anonymous users', async () => {
  const admin = await actor([], 'Administrator')
  const member = await actor([], 'Member')
  assert.equal(await run(member.user.id, memberOnly), 'ok')
  assert.equal(await run(admin.user.id, memberOnly), '403 Access denied')
  assert.equal(await run(admin.user.id, checkUserType('Administrator', 'Member')), 'ok')

  const roleless = await actor([], 'Member')
  await db.user.update({ where: { id: roleless.user.id }, data: { roleId: null } })
  assert.equal(await run(roleless.user.id, memberOnly), '403 Access denied: no role assigned')

  await userService.deleteUser(member.user.slug!, admin.user.id)
  assert.equal(await run(member.user.id, memberOnly), '401 Unauthorized access')
  assert.equal(await run(undefined, memberOnly), '401 Unauthorized access')
})

test('user-type gate: a type outside USER_TYPES, or none, is refused when the route is defined', () => {
  assert.throws(
    () => checkUserType('Membr' as UserType),
    /types from USER_TYPES \(Administrator, Member\); got: Membr$/,
  )
  assert.throws(() => checkUserType(), /got: none$/)
})

test('user-type gate chained with checkPermission resolves the role once per request', async (t) => {
  const { user } = await actor([permission], 'Member')
  const mget = t.mock.method(cacheService, 'mget')
  assert.equal(await run(user.id, memberOnly, checkPermission(permission)), 'ok')
  assert.equal(mget.mock.callCount(), 1)
  assert.equal(
    await run(user.id, memberOnly, checkPermission(PERMISSIONS.DATA_MASTER.USER.DELETE)),
    '403 You do not have permission to perform this action',
  )
})

test('user-type gate: a role type change applies on the next request', async () => {
  const admin = await actor()
  const { user, role } = await actor([], 'Member')
  // The first request caches the role as a Member.
  assert.equal(await run(user.id, memberOnly), 'ok')
  await roleService.updateRole(role.slug, { userType: 'Administrator' }, admin.user.id)
  assert.equal(await run(user.id, memberOnly), '403 Access denied')
})

test('rbac cache: an entry cached before roles carried userType is refilled, not denied', async () => {
  const { user, role } = await actor([permission], 'Member')
  await redis.set(RBAC_VERSION_KEY, 7)
  await cacheService.set(
    `user-role:${user.id}`,
    { id: user.id, role: { id: role.id, slug: role.slug, access: [permission] }, rbacVersion: 7 },
    300,
  )
  assert.equal(await run(user.id, memberOnly), 'ok')
  const refilled = await cacheService.get<{ role: { userType: string } }>(`user-role:${user.id}`)
  assert.equal(refilled?.role.userType, 'Member')
})
