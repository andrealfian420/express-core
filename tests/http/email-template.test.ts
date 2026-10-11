// Purpose: Verify the email template editor over HTTP: authentication and permissions, listing
//   and showing with variable hints, sanitized and validated edits, and the audit record.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, actor fixtures, email-template seeder, Prisma.
// Main Functions: Access, read, edit and validation cases.
// Side Effects: Writes isolated identity, template and activity-log rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db } from '../support/integration'
import { api } from '../support/http'
import emailTemplateSeeder from '../../src/seeders/email-template.seeder'
import { PERMISSIONS } from '../../src/modules/role/role.permissions'

setupIntegration()

const { INDEX, EDIT } = PERMISSIONS.DATA_MASTER.EMAIL_TEMPLATE

test('email templates: authentication and the index/edit permissions are enforced', async () => {
  await emailTemplateSeeder.run(db)
  await api('get', '/email-templates').expect(401)
  const reader = await actor([INDEX])
  const none = await actor([PERMISSIONS.DATA_MASTER.USER.INDEX])
  await api('get', '/email-templates', none.token).expect(403)
  const list = await api('get', '/email-templates', reader.token).expect(200)
  assert.deepEqual(
    list.body.data.data.map((row: { key: string }) => row.key),
    ['email-verified', 'registration-code', 'reset-password', 'verify-email'],
  )
  assert.equal('body' in list.body.data.data[0], false)
  await api('put', '/email-templates/verify-email', reader.token).send({ title: 'X' }).expect(403)

  const shown = await api('get', '/email-templates/reset-password', reader.token).expect(200)
  assert.deepEqual(shown.body.data.requiredVariables, ['link'])
  assert.deepEqual(
    shown.body.data.variables.map((variable: { name: string }) => variable.name),
    ['name', 'link', 'expires_minutes', 'app_name'],
  )
  assert.equal('id' in shown.body.data, false)
  await api('get', '/email-templates/nope', reader.token).expect(404)
})

test('email templates: edits are sanitized, validated against the catalog and audited', async () => {
  await emailTemplateSeeder.run(db)
  const editor = await actor([INDEX, EDIT])
  const saved = await api('put', '/email-templates/reset-password', editor.token)
    .send({
      subject: 'Reset at {{app_name}}',
      body:
        '<p style="color:#111" onmouseover="steal()">Hi {{name}}</p><script>alert(1)</script>' +
        '<a href="{{link}}" style="color:#4f46e5">Reset</a>',
      isActive: true,
    })
    .expect(200)
  assert.equal(
    saved.body.data.body,
    '<p style="color:#111">Hi {{name}}</p><a href="{{link}}" style="color:#4f46e5">Reset</a>',
  )
  assert.equal(saved.body.data.subject, 'Reset at {{app_name}}')

  const missing = await api('put', '/email-templates/reset-password', editor.token)
    .send({ body: '<p>No link here {{lnk}}</p>' })
    .expect(400)
  assert.equal(missing.body.message, 'Validation failed')
  assert.deepEqual(missing.body.errors, [
    { field: 'body', message: 'Unknown variable {{lnk}}' },
    { field: 'body', message: 'Body must contain {{link}}' },
  ])
  assert.match(
    (await db.emailTemplate.findUniqueOrThrow({ where: { key: 'reset-password' } })).body,
    /href="\{\{link\}\}"/,
  )
  await api('put', '/email-templates/reset-password', editor.token).send({}).expect(400)
  await api('put', '/email-templates/reset-password', editor.token)
    .send({ key: 'other', title: 'Renamed' })
    .expect(200)
  const row = await db.emailTemplate.findUniqueOrThrow({ where: { key: 'reset-password' } })
  assert.equal(row.title, 'Renamed')

  const audit = await db.activityLog.findMany({ where: { subjectType: 'EmailTemplate' } })
  assert.equal(audit.length, 2)
  assert.equal(audit[0].userId, editor.user.id)
})
