// Purpose: Guard and reset disposable persistence and construct authenticated fixtures.
// Caller: Integration and HTTP test suites.
// Dependencies: Prisma, Redis, BullMQ queues, Node test hooks, scripts/test-environment.cjs.
// Main Functions: setupIntegration, actor, waitFor, db, password, reset, assertTestDatabase.
// Side Effects: Truncates only the verified test database; flushes the isolated Redis;
//   closes queues, Prisma, Redis and the logger after each test file.
import { beforeEach, after } from 'node:test'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generateAccessToken } from '../../src/utils/jwt'
import { ALL_PERMISSIONS } from '../../src/modules/role/role.permissions'

// Validate before importing any application resource singleton.
const {
  assertTarget,
  TEST_IDENTITY,
} = require('../../../scripts/test-environment.cjs')
assertTarget()

export const db = new PrismaClient()
export const password = 'Password1!'

// Live identity check; run before any setup or cleanup that writes outside a single test row.
export async function assertTestDatabase() {
  assertTarget()
  const [identity] = await db.$queryRaw<
    { db: string; username: string }[]
  >`SELECT current_database() AS db, current_user AS username`
  if (
    identity.db !== TEST_IDENTITY.database ||
    identity.username !== TEST_IDENTITY.user
  )
    throw new Error('Unsafe database reset')
}

export async function reset() {
  await assertTestDatabase()
  const tables = await db.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`
  if (tables.length)
    await db.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => '"' + t.tablename.replace(/"/g, '""') + '"').join(',')} RESTART IDENTITY CASCADE`,
    )
  const redis = (await import('../../src/config/redis')).default
  await redis.flushdb()
}

export function setupIntegration() {
  beforeEach(reset)
  after(async () => {
    const { default: email } = await import('../../src/jobs/queues/email.queue')
    const { default: system } =
      await import('../../src/jobs/queues/system.queue')
    await Promise.all([email.close(), system.close()])
    await (await import('../../src/config/database')).default.$disconnect()
    await db.$disconnect()
    const redis = (await import('../../src/config/redis')).default
    if (redis.status !== 'end') await redis.quit()
    ;(await import('../../src/config/logger')).default.close()
  })
}

// Creates a verified user with its own role; returns the bearer access token.
export async function actor(
  access: string[] = ALL_PERMISSIONS,
  userType = 'Administrator',
) {
  const sequence = await db.role.count()
  const role = await db.role.create({
    data: {
      title: `${userType} ${sequence}`,
      slug: `role-${sequence}`,
      userType,
      access,
    },
  })
  const user = await db.user.create({
    data: {
      name: 'Test Actor',
      slug: `user-${role.id}`,
      email: `actor-${role.id}@example.invalid`,
      password: await bcrypt.hash(password, 4),
      roleId: role.id,
      isEmailVerified: true,
    },
  })
  return { user, role, token: generateAccessToken({ id: user.id }) }
}

// Polls until `check` returns a truthy value or the deadline passes (bounded asynchronous wait).
export async function waitFor<T>(
  check: () => T | Promise<T>,
  timeoutMs = 10_000,
  intervalMs = 25,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline)
      throw new Error(`Condition not met within ${timeoutMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
