// Purpose: Prove the verification email reaches the mail transport with a working link, and
//   that link jobs without a token fail permanently.
// Caller: Node integration runner.
// Dependencies: Real BullMQ email worker and processor, mocked nodemailer transport
//   (no SMTP connection), HTTP helper, isolated PostgreSQL/Redis.
// Main Functions: Registration → queue → worker → transport → link → verification case;
//   missing-token processor case.
// Side Effects: Writes isolated identity/token rows and queue jobs; the test-owned worker
//   is closed in `finally`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { UnrecoverableError, Job } from 'bullmq'
import { setupIntegration, db, password, waitFor } from '../support/integration'
import { api, request } from '../support/http'
import transporter from '../../src/email/mailer'
import { processEmailJob } from '../../src/jobs/workers/email.processor'

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

test('email: registration link reaches the transport, carries the stored token and verifies the account', async (t) => {
  const sent = fakeTransport(t)
  const email = 'link@example.invalid'
  const registered = await api('post', '/auth/register')
    .send({ name: 'Link User', email, password })
    .expect(201)
  const { token } = await db.emailVerificationToken.findFirstOrThrow()
  assert.ok(!JSON.stringify(registered.body).includes(token))

  const { default: worker } = await import('../../src/jobs/workers/email.worker')
  try {
    await waitFor(() => sent.length >= 1)
    assert.equal(sent[0].to, email)
    const link = /href="([^"]+)"/.exec(sent[0].html)?.[1]
    assert.equal(
      link,
      `http://test.invalid/api/v1/auth/verify-email?token=${token}`,
    )

    const url = new URL(link!)
    await request.get(`${url.pathname}${url.search}`).expect(200)
    assert.equal(
      (await db.user.findFirstOrThrow({ where: { email } })).isEmailVerified,
      true,
    )

    await waitFor(() => sent.length >= 2)
    assert.equal(sent[1].subject, 'Email Verified Successfully')
    await api('post', '/auth/login').send({ email, password }).expect(200)
  } finally {
    await worker.close()
  }
})

test('email: link jobs without a token fail permanently and send nothing', async (t) => {
  const sent = fakeTransport(t)
  for (const name of ['sendVerificationEmail', 'sendResetPasswordEmail'])
    await assert.rejects(
      () =>
        processEmailJob({
          id: '1',
          name,
          data: { email: 'user@example.invalid', name: 'User' },
        } as unknown as Job),
      UnrecoverableError,
    )
  assert.equal(sent.length, 0)
})

test('email: reset links use APP_URL once (no duplicated port) and carry the token', async (t) => {
  const sent = fakeTransport(t)
  await processEmailJob({
    id: '2',
    name: 'sendResetPasswordEmail',
    data: { email: 'user@example.invalid', name: 'User', token: 'reset-token' },
  } as unknown as Job)
  const link = /href="([^"]+)"/.exec(sent[0].html)?.[1] ?? ''
  assert.ok(link.startsWith('http://test.invalid/'))
  assert.equal(new URL(link).searchParams.get('token'), 'reset-token')
  assert.ok(!link.includes(process.env.PORT!))
})
