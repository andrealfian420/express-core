// Purpose: Verify the seed runner and core seeders through the compiled CLI: a fresh database
//   is seeded, reruns keep administrator edits and only grant missing permissions, and unknown
//   names fail before anything runs.
// Caller: Node integration runner.
// Dependencies: Compiled src/scripts/seed.js, role permissions, bcryptjs, isolated PostgreSQL.
// Main Functions: Fresh seed, rerun preservation and runner argument cases.
// Side Effects: Runs the seed CLI as a child process against the test database; writes
//   isolated role and user rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { setupIntegration, db } from '../support/integration'
import { ALL_PERMISSIONS } from '../../src/modules/role/role.permissions'

setupIntegration()

const CLI = path.resolve(__dirname, '../../src/scripts/seed.js')
const seed = (...args: string[]) =>
  spawnSync(process.execPath, [CLI, ...args], {
    env: process.env,
    encoding: 'utf8',
    timeout: 60_000,
  })

const superAdmin = () => db.role.findFirstOrThrow({ where: { slug: 'super-admin' } })
const admin = () => db.user.findFirstOrThrow({ where: { email: 'admin@admin.com' } })

test('seed: a fresh database gets the super-admin role with every permission and the admin account', async () => {
  const result = seed()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\[seed\] role: created super-admin with \d+ permissions/)
  assert.match(result.stdout, /\[seed\] admin-user: created admin@admin\.com/)
  const role = await superAdmin()
  assert.deepEqual(role.access, ALL_PERMISSIONS)
  const user = await admin()
  assert.equal(user.roleId, role.id)
  assert.equal(user.isEmailVerified, true)
  assert.equal(user.slug, 'administrator')
  assert.ok(await bcrypt.compare('password', user.password!))
})

test('seed: a rerun keeps administrator edits and only grants missing permissions (regression)', async () => {
  assert.equal(seed().status, 0)
  const role = await superAdmin()
  const [kept] = ALL_PERMISSIONS
  await db.role.update({
    where: { id: role.id },
    data: { title: 'Owner', description: 'Edited', access: [kept, 'custom.extra'] },
  })
  const user = await admin()
  await db.user.update({
    where: { id: user.id },
    data: { name: 'Site Owner', password: await bcrypt.hash('Changed2!', 4) },
  })

  const rerun = seed()
  assert.equal(rerun.status, 0, rerun.stderr)
  assert.match(rerun.stdout, new RegExp(`granted ${ALL_PERMISSIONS.length - 1} new permission`))
  assert.match(rerun.stdout, /admin@admin\.com already exists; left unchanged/)
  const edited = await superAdmin()
  assert.equal(edited.title, 'Owner')
  assert.equal(edited.description, 'Edited')
  // Nothing removed (not even unknown values); missing ones appended in catalogue order.
  assert.deepEqual(edited.access, [
    kept,
    'custom.extra',
    ...ALL_PERMISSIONS.filter((value) => value !== kept),
  ])
  const keptUser = await admin()
  assert.equal(keptUser.name, 'Site Owner')
  // Before T6 every rerun reset the password to the well-known default.
  assert.ok(await bcrypt.compare('Changed2!', keptUser.password!))
  assert.equal(await db.role.count(), 1)
  assert.equal(await db.user.count(), 1)

  // Up to date: nothing is written at all.
  const third = seed()
  assert.equal(third.status, 0, third.stderr)
  assert.match(third.stdout, /super-admin already holds every permission; left unchanged/)
  assert.deepEqual((await superAdmin()).updatedAt, edited.updatedAt)
})

test('seed: unknown names fail before anything runs; named seeders run alone, in registry order', async () => {
  const unknown = seed('role', 'nope')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /Unknown seeder\(s\): nope/)
  assert.match(unknown.stderr, /Available seeders:\n {2}role .*\n {2}admin-user /)
  assert.equal(await db.role.count(), 0)

  const orphan = seed('admin-user')
  assert.equal(orphan.status, 1)
  assert.match(orphan.stderr, /admin-user failed: Role "super-admin" not found; run the "role" seeder first/)
  assert.equal(await db.user.count(), 0)

  const named = seed('admin-user', 'role')
  assert.equal(named.status, 0, named.stderr)
  assert.match(named.stdout, /\[seed\] role: .*\n\[seed\] admin-user: /)

  const help = seed('--help')
  assert.equal(help.status, 0)
  assert.match(help.stdout, /^Usage: node prisma\/seed\.js/)
})
