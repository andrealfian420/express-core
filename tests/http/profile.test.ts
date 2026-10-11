// Purpose: Verify the extended profile over HTTP: set, read back, clear (JSON null and empty
//   multipart fields), validation errors, admin visibility without admin write access, privacy
//   of the audit record, and one row under parallel first-time updates.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, actor fixtures, Prisma.
// Main Functions: Profile details lifecycle and concurrency cases.
// Side Effects: Writes isolated identity, profile and activity-log rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db } from '../support/integration'
import { api } from '../support/http'

setupIntegration()

const details = {
  phone: '+62 812 3456 789',
  birthDate: '1990-05-01',
  gender: 'female',
  locale: 'ID',
}
const stored = { phone: '+628123456789', birthDate: '1990-05-01', gender: 'female', locale: 'id' }

test('profile details: set, read back, clear, shown to admins, not writable through /users, audited by name only', async () => {
  const admin = await actor()
  const { user, token } = await actor()
  assert.equal((await api('get', '/profile', token).expect(200)).body.data.profile, null)

  const saved = await api('put', '/profile', token)
    .send({ name: user.name, ...details })
    .expect(200)
  assert.deepEqual(saved.body.data.profile, stored)
  assert.deepEqual((await api('get', '/profile', token).expect(200)).body.data.profile, stored)

  const cleared = await api('put', '/profile', token)
    .send({ name: user.name, phone: null })
    .expect(200)
  assert.deepEqual(cleared.body.data.profile, { ...stored, phone: null })
  // Multipart forms (avatar uploads) clear with an empty field.
  const form = await api('put', '/profile', token)
    .field('name', user.name!)
    .field('gender', '')
    .expect(200)
  assert.deepEqual(form.body.data.profile, { ...stored, phone: null, gender: null })

  const shown = await api('get', `/users/${user.slug}`, admin.token).expect(200)
  assert.deepEqual(shown.body.data.profile, { ...stored, phone: null, gender: null })
  await api('put', `/users/${user.slug}`, admin.token)
    .send({ roleId: String(user.roleId), phone: '+15550000000', gender: 'male' })
    .expect(200)
  assert.deepEqual(
    (await api('get', '/profile', token).expect(200)).body.data.profile,
    { ...stored, phone: null, gender: null },
  )

  const logs = await db.activityLog.findMany({
    where: { subjectType: 'Profile', userId: user.id },
    orderBy: { id: 'asc' },
  })
  assert.deepEqual((logs[0].newData as { profileFields: string[] }).profileFields, [
    'phone',
    'birthDate',
    'gender',
    'locale',
  ])
  assert.doesNotMatch(JSON.stringify(logs), /628123456789|1990-05-01/)
})

test('profile details: invalid values answer 400 with one error per field', async () => {
  const { user, token } = await actor()
  const rejected = await api('put', '/profile', token)
    .send({ name: user.name, phone: '0812', birthDate: '2999-01-01', gender: 'x', locale: 'fr' })
    .expect(400)
  assert.deepEqual(
    rejected.body.errors.map((error: { field: string }) => error.field).sort(),
    ['birthDate', 'gender', 'locale', 'phone'],
  )
  assert.equal(await db.userProfile.count(), 0)
})

test('profile details: parallel first-time updates create exactly one row', async () => {
  const { user, token } = await actor()
  const responses = await Promise.all(
    ['+628111111111', '+628222222222', '+628333333333', '+628444444444'].map((phone) =>
      api('put', '/profile', token).send({ name: user.name, phone }),
    ),
  )
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200, 200],
  )
  assert.equal(await db.userProfile.count({ where: { userId: user.id } }), 1)
})
