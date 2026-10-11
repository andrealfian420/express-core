// Purpose: Verify mail failure classification (permanent vs transient), the ZeptoMail request
//   and its outcomes, and configuration checks for both drivers.
// Caller: Node unit runner.
// Dependencies: src/email/mailer with a mocked Nodemailer transport and a mocked global fetch
//   (no SMTP connection or HTTP request), logger.
// Main Functions: isPermanentSmtpError table, sendMail outcomes, ZeptoMail request/outcome
//   cases, validateMailConfig.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import transporter, {
  PermanentMailError,
  ZEPTOMAIL_TIMEOUT_MS,
  isPermanentSmtpError,
  sendMail,
  sendViaZeptoMail,
  validateMailConfig,
} from '../../src/email/mailer'
import logger from '../../src/config/logger'

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
  assert.deepEqual(validateMailConfig({ MAIL_DRIVER: 'zeptomail' }), [
    'ZEPTOMAIL_KEY is not set',
    'ZEPTOMAIL_FROM_ADDRESS is not set',
  ])
})

const zepto = {
  ZEPTOMAIL_API_URL: 'https://api.zeptomail.eu/v1.1/email',
  APP_NAME: 'Example App',
  ZEPTOMAIL_KEY: 'Zoho-enczapikey secret-token',
  ZEPTOMAIL_FROM_ADDRESS: 'noreply@example.invalid',
}

function fakeFetch(t: { mock: any }, ...replies: (Response | Error)[]) {
  return t.mock.method(globalThis, 'fetch', async () => {
    const reply = replies.shift()!
    if (reply instanceof Error) throw reply
    return reply
  })
}

test('zeptomail: one JSON request with the configured sender, the token header and a timeout', async (t) => {
  const fetch = fakeFetch(t, new Response('{"data":[]}', { status: 201 }))
  await sendViaZeptoMail(message, zepto)
  const [url, init] = fetch.mock.calls[0].arguments as [string, RequestInit]
  assert.equal(url, zepto.ZEPTOMAIL_API_URL)
  assert.equal(init.method, 'POST')
  assert.deepEqual(init.headers, {
    Authorization: 'Zoho-enczapikey secret-token',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  })
  assert.deepEqual(JSON.parse(String(init.body)), {
    from: { address: 'noreply@example.invalid', name: 'Example App' },
    to: [{ email_address: { address: 'user@example.invalid' } }],
    subject: 'Subject',
    htmlbody: '<p>token=secret</p>',
  })
  assert.ok(init.signal instanceof AbortSignal)
  assert.ok(ZEPTOMAIL_TIMEOUT_MS < 60_000)

  fakeFetch(t, new Response('{}', { status: 200 }))
  await sendViaZeptoMail(message, { ...zepto, ZEPTOMAIL_KEY: 'plain-token', ZEPTOMAIL_FROM_NAME: 'Support' })
  const [, second] = (globalThis.fetch as any).mock.calls[0].arguments as [string, RequestInit]
  assert.equal((second.headers as Record<string, string>).Authorization, 'Zoho-enczapikey plain-token')
  assert.equal(JSON.parse(String(second.body)).from.name, 'Support')
})

test('zeptomail: request rejections are permanent; 408, 429, 5xx, network errors and timeouts are retried; logs omit the body', async (t) => {
  const errors = t.mock.method(logger, 'error', () => logger)
  for (const status of [400, 401, 403, 422])
    await assert.rejects(
      () => (fakeFetch(t, new Response('{"error":"bad"}', { status })), sendViaZeptoMail(message, zepto)),
      PermanentMailError,
      String(status),
    )
  for (const reply of [
    new Response('slow', { status: 408 }),
    new Response('busy', { status: 429 }),
    new Response('down', { status: 503 }),
    new TypeError('fetch failed'),
    new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
  ]) {
    fakeFetch(t, reply)
    await assert.rejects(
      () => sendViaZeptoMail(message, zepto),
      (error: unknown) => !(error instanceof PermanentMailError),
    )
  }
  assert.doesNotMatch(JSON.stringify(errors.mock.calls.map((call) => call.arguments)), /token=secret/)

  const unconfigured = fakeFetch(t)
  await assert.rejects(
    () => sendViaZeptoMail(message, { ...zepto, ZEPTOMAIL_KEY: undefined }),
    /Mail is not configured: ZEPTOMAIL_KEY is not set/,
  )
  assert.equal(unconfigured.mock.callCount(), 0)
})
