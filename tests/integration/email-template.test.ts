// Purpose: Prove template-driven email delivery against real persistence: built-in fallback when
//   a template is missing or inactive, database text when active, edits applying to the next
//   email (no cache), escaped user data, and the idempotent template seeder.
// Caller: Node integration runner.
// Dependencies: Email template service, email processor, email-template seeder, mocked
//   Nodemailer transport, logger, Prisma, isolated PostgreSQL/Redis.
// Main Functions: Render source, delivery, edit validation and seeding cases.
// Side Effects: Writes isolated email_templates rows; mocks are restored per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Job } from 'bullmq'
import { setupIntegration, db } from '../support/integration'
import transporter from '../../src/email/mailer'
import logger from '../../src/config/logger'
import { processEmailJob } from '../../src/jobs/workers/email.processor'
import emailTemplateService from '../../src/modules/email-template/email-template.service'
import { EMAIL_TEMPLATE_CATALOG } from '../../src/modules/email-template/email-template.catalog'
import emailTemplateSeeder from '../../src/seeders/email-template.seeder'

setupIntegration()

type SentMail = { to: string; subject: string; html: string }

function fakeTransport(t: { mock: any }) {
  const sent: SentMail[] = []
  t.mock.method(transporter as any, 'sendMail', async (mail: SentMail) => {
    sent.push(mail)
    return { messageId: `test-${sent.length}` }
  })
  return sent
}

const resetJob = (name: string) =>
  ({
    id: undefined,
    name: 'sendResetPasswordEmail',
    data: { email: 'user@example.invalid', name, token: 'reset-token' },
  }) as unknown as Job

test('email templates: built-in text until seeded, database text when active, built-in again when inactive', async (t) => {
  const warn = t.mock.method(logger, 'warn', () => logger)
  const vars = { name: 'Ann', link: 'https://a.invalid/r', expires_minutes: 30 }

  const fallback = await emailTemplateService.render('reset-password', vars)
  assert.equal(fallback.subject, EMAIL_TEMPLATE_CATALOG['reset-password'].subject)
  assert.match(fallback.html, /href="https:\/\/a\.invalid\/r"/)
  assert.equal(warn.mock.calls[0].arguments[0], 'Email template is not seeded; sending the built-in text')

  await emailTemplateSeeder.run(db)
  await db.emailTemplate.update({
    where: { key: 'reset-password' },
    data: { subject: 'Reset for {{name}} at {{app_name}}', body: '<p>Custom {{link}}</p>' },
  })
  const custom = await emailTemplateService.render('reset-password', vars)
  assert.equal(custom.subject, 'Reset for Ann at Express Core Test')
  assert.match(custom.html, /<p>Custom https:\/\/a\.invalid\/r<\/p>/)

  await db.emailTemplate.update({ where: { key: 'reset-password' }, data: { isActive: false } })
  const inactive = await emailTemplateService.render('reset-password', vars)
  assert.equal(inactive.subject, 'Reset Your Password')
  assert.equal(warn.mock.callCount(), 1)
})

test('email templates: the worker sends the edited text on the very next email, with user data escaped', async (t) => {
  const sent = fakeTransport(t)
  await emailTemplateSeeder.run(db)
  await processEmailJob(resetJob('Ann'))
  assert.equal(sent[0].subject, 'Reset Your Password')

  await db.emailTemplate.update({
    where: { key: 'reset-password' },
    data: { body: '<p>Hello {{name}}, use {{link}} within {{expires_minutes}} minutes.</p>' },
  })
  await processEmailJob(resetJob('<img src=x onerror=alert(1)>'))
  assert.match(
    sent[1].html,
    /<p>Hello &lt;img src=x onerror=alert\(1\)&gt;, use http:\/\/test\.invalid\/reset-password\?token=reset-token within 30 minutes\.<\/p>/,
  )
})

test('email templates: the built-in text escapes user data and states the configured link lifetime (regression)', async (t) => {
  const sent = fakeTransport(t)
  await processEmailJob(resetJob('<img src="https://track.invalid/p.gif">'))
  // Before O02 the name was inserted as raw HTML and the lifetime was hard-coded as "1 hour".
  assert.doesNotMatch(sent[0].html, /<img src="https:\/\/track/)
  assert.match(
    sent[0].html,
    /Hello, <strong>&lt;img src=&quot;https:\/\/track\.invalid\/p\.gif&quot;&gt;<\/strong>/,
  )
  assert.match(sent[0].html, /valid for <strong>30 minutes<\/strong>/)
})

test('email templates: an edit that would break the email is refused with field details', async () => {
  await emailTemplateSeeder.run(db)
  await assert.rejects(
    () => emailTemplateService.update('registration-code', { body: '<p>Your code: {{cod}}</p>' }),
    (error: any) => {
      assert.equal(error.statusCode, 400)
      assert.deepEqual(error.errors, [
        { field: 'body', message: 'Unknown variable {{cod}}' },
        { field: 'body', message: 'Body must contain {{code}}' },
      ])
      return true
    },
  )
  await assert.rejects(() => emailTemplateService.update('nope', { title: 'X' }), /not found/)
})

test('email-template seeder: inserts missing keys only and never overwrites edits', async () => {
  assert.equal(await emailTemplateSeeder.run(db), 'created 4 template(s)')
  await db.emailTemplate.update({ where: { key: 'verify-email' }, data: { title: 'Edited' } })
  await db.emailTemplate.delete({ where: { key: 'email-verified' } })
  assert.equal(
    await emailTemplateSeeder.run(db),
    'created 1 template(s); 3 already present, left unchanged',
  )
  assert.equal(
    (await db.emailTemplate.findUniqueOrThrow({ where: { key: 'verify-email' } })).title,
    'Edited',
  )
  assert.equal(await db.emailTemplate.count(), 4)
})
