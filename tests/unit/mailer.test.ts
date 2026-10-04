// Purpose: Verify mail failure classification (permanent vs transient) and configuration checks.
// Caller: Node unit runner.
// Dependencies: src/email/mailer with a mocked Nodemailer transport (no SMTP connection).
// Main Functions: isPermanentSmtpError table, sendMail outcomes, validateMailConfig.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import transporter, {
  PermanentMailError,
  isPermanentSmtpError,
  sendMail,
  validateMailConfig,
} from '../../src/email/mailer'

const message = {
  to: 'user@example.invalid',
  subject: 'Subject',
  html: '<p>token=secret</p>',
}

function smtpError(fields: Record<string, unknown>) {
  return Object.assign(new Error('smtp failure'), fields)
}

test('mailer: 5xx replies and envelope errors are permanent; 4xx, timeouts and drops are not', () => {
  for (const error of [
    smtpError({ responseCode: 550 }),
    smtpError({ responseCode: 553 }),
    smtpError({ code: 'EENVELOPE' }),
  ])
    assert.equal(isPermanentSmtpError(error), true)
  for (const error of [
    smtpError({ responseCode: 421 }),
    smtpError({ responseCode: 451 }),
    smtpError({ code: 'ETIMEDOUT' }),
    smtpError({ code: 'ECONNRESET' }),
    new Error('unknown'),
    null,
  ])
    assert.equal(isPermanentSmtpError(error), false)
})

test('mailer: sendMail uses the configured sender and maps permanent SMTP failures', async (t) => {
  const send = t.mock.method(transporter as any, 'sendMail', async () => ({}))
  await sendMail(message)
  assert.deepEqual(send.mock.calls[0].arguments[0], {
    from: 'Express Core Test <noreply@test.invalid>',
    ...message,
  })

  send.mock.mockImplementation(async () => {
    throw smtpError({ responseCode: 550 })
  })
  await assert.rejects(sendMail(message), PermanentMailError)

  const transient = smtpError({ code: 'ECONNRESET' })
  send.mock.mockImplementation(async () => {
    throw transient
  })
  await assert.rejects(sendMail(message), (error) => error === transient)
})

test('mailer: configuration problems are reported; the test configuration is complete', () => {
  assert.deepEqual(validateMailConfig(), [])
  assert.deepEqual(
    validateMailConfig({ MAIL_DRIVER: 'smtp', SMTP_HOST: undefined, SMTP_FROM: undefined }),
    ['SMTP_HOST is not set', 'SMTP_FROM is not set'],
  )
})
