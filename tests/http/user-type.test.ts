// Purpose: Verify the role editor's user-type contract over HTTP: the catalogue endpoint, role
//   create/update limited to listed types, and roles stored with an unlisted type staying
//   editable while their type is left unchanged.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, actor fixtures, Prisma.
// Main Functions: Catalogue endpoint and role userType validation cases.
// Side Effects: Writes isolated role and audit rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db } from '../support/integration'
import { api } from '../support/http'

setupIntegration()

const typeError = { field: 'userType', message: 'User type must be one of: Administrator, Member' }

test('roles: the user-type catalogue is listed to any signed-in user', async () => {
  await api('get', '/roles/user-types').expect(401)
  const { token } = await actor([])
  const listed = await api('get', '/roles/user-types', token).expect(200)
  assert.deepEqual(listed.body.data, ['Administrator', 'Member'])
})

test('roles: userType must come from the catalogue; a role with an unlisted type stays editable', async () => {
  const { token } = await actor()
  const refused = await api('post', '/roles', token)
    .send({ title: 'Editor', userType: 'Editor' })
    .expect(400)
  assert.deepEqual(refused.body.errors, [typeError])
  const missing = await api('post', '/roles', token).send({ title: 'Editor' }).expect(400)
  assert.deepEqual(missing.body.errors, [{ field: 'userType', message: 'User type is required' }])

  const created = await api('post', '/roles', token)
    .send({ title: 'Members', userType: 'Member' })
    .expect(201)
  assert.equal(created.body.data.userType, 'Member')
  const changed = await api('put', `/roles/${created.body.data.slug}`, token)
    .send({ userType: 'Guest' })
    .expect(400)
  assert.deepEqual(changed.body.errors, [typeError])

  // Roles saved before the catalogue existed keep their type until it is edited.
  await db.role.create({ data: { slug: 'legacy', title: 'Legacy', userType: 'Editor' } })
  const kept = await api('put', '/roles/legacy', token)
    .send({ description: 'Still editable' })
    .expect(200)
  assert.equal(kept.body.data.userType, 'Editor')
  const moved = await api('put', '/roles/legacy', token).send({ userType: 'Member' }).expect(200)
  assert.equal(moved.body.data.userType, 'Member')
})
