// Purpose: Verify login cookies, profile ownership, user/role administration and RBAC cache
//   invalidation through the real router and persistence.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, actor fixtures, Prisma.
// Main Functions: Identity lifecycle, audit, soft delete and permission-cache cases.
// Side Effects: Writes isolated identity, audit and cache records.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db, password } from '../support/integration'
import { api } from '../support/http'

setupIntegration()

test('auth/profile: cookie login, own profile, privilege fields ignored, logout and missing cookie', async () => {
  const { user, token } = await actor()
  await api('post', '/auth/login')
    .send({ email: user.email, password: 'wrong' })
    .expect(401)
  await api('post', '/auth/login').send({ email: 'bad' }).expect(400)
  const login = await api('post', '/auth/login')
    .send({ email: user.email, password })
    .expect(200)
  assert.match(String(login.headers['set-cookie']), /refreshToken=.*HttpOnly/i)
  assert.ok(login.body.data.accessToken)
  const profile = await api('get', '/profile', token).expect(200)
  assert.equal(profile.body.data.email, user.email)
  await api('put', '/profile', token)
    .send({ name: 'Changed Name', roleId: 999 })
    .expect(200)
  const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(stored.roleId, user.roleId)
  assert.equal(stored.name, 'Changed Name')
  const refreshed = await api('post', '/auth/refresh')
    .set('Cookie', login.headers['set-cookie'])
    .expect(200)
  assert.ok(refreshed.body.data.accessToken)
  await api('post', '/auth/logout')
    .set('Cookie', refreshed.headers['set-cookie'])
    .expect(200)
  await api('post', '/auth/refresh')
    .set('Cookie', refreshed.headers['set-cookie'])
    .expect(401)
  await api('post', '/auth/refresh').expect(401)
})

test('profile: password change revokes refresh sessions and clears the cookie', async () => {
  const { user, token } = await actor()
  const login = await api('post', '/auth/login')
    .send({ email: user.email, password })
    .expect(200)
  const changed = await api('put', '/profile', token)
    .send({ name: user.name, password: 'Changed2!' })
    .expect(200)
  assert.match(String(changed.headers['set-cookie']), /refreshToken=;/)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
  await api('post', '/auth/refresh')
    .set('Cookie', login.headers['set-cookie'])
    .expect(401)
  await api('post', '/auth/login')
    .send({ email: user.email, password: 'Changed2!' })
    .expect(200)
})

test('role/user: create, validation, duplicate rejection, update, audit and soft delete', async () => {
  const { token } = await actor()
  const role = (
    await api('post', '/roles', token)
      .send({ title: 'Editor', userType: 'Administrator', access: [] })
      .expect(201)
  ).body.data
  await api('post', '/roles', token)
    .send({ title: 'Bad', userType: 'Administrator', access: ['made-up-permission'] })
    .expect(400)
  await api('post', '/roles', token).send({}).expect(400)
  const input = {
    name: 'Created User',
    email: 'created@example.invalid',
    password,
    roleId: String(role.id),
  }
  await api('post', '/users', token).send({}).expect(400)
  const user = (await api('post', '/users', token).send(input).expect(201)).body
    .data
  assert.equal(user.slug, 'created-user')
  await api('post', '/users', token).send(input).expect(400)
  const shown = await api('get', `/users/${user.slug}`, token).expect(200)
  assert.equal(shown.body.data.email, input.email)
  const updated = (
    await api('put', `/users/${user.slug}`, token)
      .send({ name: 'Updated User', roleId: String(role.id) })
      .expect(200)
  ).body.data
  assert.equal(updated.slug, 'updated-user')
  await api('get', '/users/missing', token).expect(404)
  await api('put', `/roles/${role.slug}`, token)
    .send({ description: 'Changed' })
    .expect(200)
  const audit = await db.activityLog.findMany({ orderBy: { id: 'asc' } })
  assert.deepEqual(
    audit.map((log) => `${log.action} ${log.subjectType}`),
    ['CREATE Role', 'CREATE User', 'UPDATE User', 'UPDATE Role'],
  )
  await api('get', `/activity-logs/${audit[1].id}`, token).expect(200)
  await api('get', '/activity-logs/999999', token).expect(404)
  await api('delete', `/roles/${role.slug}`, token).expect(409)
  await api('delete', `/users/${updated.slug}`, token).expect(200)
  await api('get', `/users/${updated.slug}`, token).expect(404)
  assert.ok(
    (await db.user.findFirstOrThrow({ where: { email: input.email } })).deletedAt,
  )
  await api('delete', `/roles/${role.slug}`, token).expect(200)
  await api('get', `/roles/${role.slug}`, token).expect(404)
})

test('role: permission edits invalidate previously cached user access', async () => {
  const admin = await actor()
  const editor = await actor(['module.master-data.user.index'])
  await api('get', '/users', editor.token).expect(200)
  await api('get', '/roles', editor.token).expect(403)
  await api('put', `/roles/${editor.role.slug}`, admin.token)
    .send({ access: [] })
    .expect(200)
  await api('get', '/users', editor.token).expect(403)
})

test('access-list: authenticated users receive the permission tree', async () => {
  await api('get', '/roles/access-list').expect(401)
  const { token } = await actor([])
  const list = await api('get', '/roles/access-list', token).expect(200)
  assert.ok(
    JSON.stringify(list.body.data).includes('module.master-data.user.index'),
  )
})
