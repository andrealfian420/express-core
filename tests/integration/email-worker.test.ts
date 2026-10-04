// Purpose: Prove email delivery end to end through the transactional outbox, the relay and the
//   real worker (verification and password-reset links), and the worker failure paths:
//   transient retries, the sent marker, permanent failures and dead-lettering.
// Caller: Node integration runner.
// Dependencies: Outbox relay, email worker/processor, worker logging, dead-letter repository,
//   mocked Nodemailer transport (no SMTP connection), HTTP helper, isolated PostgreSQL/Redis.
// Main Functions: Registration and reset delivery cases; retry, marker, permanent-failure,
//   dead-letter-write-failure and processor guard cases.
// Side Effects: Writes isolated identity, token, outbox, queue and dead-letter records;
//   test-owned workers are closed in `finally`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { UnrecoverableError, Job, Worker } from 'bullmq'
import { setupIntegration, actor, db, password, waitFor } from '../support/integration'
import { api, request } from '../support/http'
import transporter from '../../src/email/mailer'
import { processEmailJob } from '../../src/jobs/workers/email.processor'
import {
  attachWorkerLogging,
  drainDeadLetterWrites,
} from '../../src/jobs/workers/worker-logging'
import { runOutboxRelayOnce } from '../../src/jobs/relay/outbox-relay'
import emailQueue from '../../src/jobs/queues/email.queue'
import { QUEUE_NAMES } from '../../src/jobs/config/queue.constants'
import redis from '../../src/config/redis'
import logger from '../../src/config/logger'
import deadLetterRepository from '../../src/modules/dead-letter/dead-letter.repository'

setupIntegration()

type SentMail = { from: string; to: string; subject: string; html: string }

function fakeTransport(t: { mock: any }, failures: Error[] = []) {
  const sent: SentMail[] = []
  const send = t.mock.method(transporter as any, 'sendMail', async (mail: SentMail) => {
    const failure = failures.shift()
    if (failure) throw failure
    sent.push(mail)
    return { messageId: `test-${sent.length}` }
  })
  return { sent, send }
}

const linkOf = (mail: SentMail): string =>
  /href="([^"]+)"/.exec(mail.html)?.[1] ?? ''

const smtpError = (message: string, fields: Record<string, unknown>) =>
  Object.assign(new Error(message), fields)

function testWorker() {
  return new Worker(QUEUE_NAMES.EMAIL, processEmailJob, { connection: redis })
}

test('email: registration → outbox → relay → worker → transport; the link verifies the account', async (t) => {
  const { sent } = fakeTransport(t)
  const email = 'link@example.invalid'
  const registered = await api('post', '/auth/register')
    .send({ name: 'Link User', email, password })
    .expect(201)
  const { token } = await db.emailVerificationToken.findFirstOrThrow()
  assert.ok(!JSON.stringify(registered.body).includes(token))
  assert.equal(await emailQueue.count(), 0)

  const { default: worker } = await import('../../src/jobs/workers/email.worker')
  try {
    assert.equal(await runOutboxRelayOnce(), 1)
    const published = await db.outbox.findFirstOrThrow()
    assert.equal(published.status, 'PUBLISHED')
    // The BullMQ job carries the payload now; the outbox copy no longer holds the token.
    assert.deepEqual(published.payload, {})

    await waitFor(() => sent.length >= 1)
    assert.equal(sent[0].to, email)
    assert.equal(
      linkOf(sent[0]),
      `http://test.invalid/api/v1/auth/verify-email?token=${token}`,
    )
    const url = new URL(linkOf(sent[0]))
    await request.get(`${url.pathname}${url.search}`).expect(200)
    assert.equal(
      (await db.user.findFirstOrThrow({ where: { email } })).isEmailVerified,
      true,
    )

    assert.equal(await runOutboxRelayOnce(), 1)
    await waitFor(() => sent.length >= 2)
    assert.equal(sent[1].subject, 'Email Verified Successfully')
    await api('post', '/auth/login').send({ email, password }).expect(200)
  } finally {
    await worker.close()
  }
})

test('email: password reset → outbox → relay → worker → transport; the link resets the password', async (t) => {
  const { sent } = fakeTransport(t)
  const { user } = await actor()
  await api('post', '/auth/request-password-reset')
    .send({ email: user.email })
    .expect(200)
  const worker = testWorker()
  try {
    assert.equal(await runOutboxRelayOnce(), 1)
    await waitFor(() => sent.length >= 1)
    assert.equal(sent[0].subject, 'Reset Your Password')
    const link = new URL(linkOf(sent[0]))
    assert.equal(`${link.origin}${link.pathname}`, 'http://test.invalid/reset-password')
    const token = link.searchParams.get('token')!
    await api('post', '/auth/reset-password')
      .send({ token, newPassword: 'Changed2!' })
      .expect(200)
    await api('post', '/auth/login')
      .send({ email: user.email, password: 'Changed2!' })
      .expect(200)
  } finally {
    await worker.close()
  }
})

test('email: a transient failure is retried, and the sent marker stops a second send of the same job id', async (t) => {
  const { sent, send } = fakeTransport(t, [
    smtpError('Connection reset', { code: 'ECONNRESET' }),
  ])
  const worker = testWorker()
  try {
    const job = await emailQueue.add(
      'sendVerificationSuccessEmail',
      { email: 'retry@example.invalid', name: 'Retry' },
      { jobId: 'outbox-900', attempts: 2, backoff: { type: 'fixed', delay: 10 } },
    )
    await waitFor(async () => (await job.getState()) === 'completed')
    assert.equal(send.mock.callCount(), 2)
    assert.equal(sent.length, 1)
    assert.equal(await redis.get('email:sent:outbox-900'), 'true')

    // A re-publish of the same outbox row (same job id) after completion sends nothing.
    await processEmailJob((await emailQueue.getJob('outbox-900'))!)
    assert.equal(send.mock.callCount(), 2)
  } finally {
    await worker.close()
  }
})

test('email: permanent failures skip retries and are dead-lettered once (SMTP 5xx, unknown job)', async (t) => {
  const { send } = fakeTransport(t, [
    smtpError('550 Mailbox unavailable', { responseCode: 550 }),
  ])
  const worker = testWorker()
  attachWorkerLogging(worker)
  try {
    const rejected = await emailQueue.add(
      'sendVerificationSuccessEmail',
      { email: 'rejected@example.invalid', name: 'Rejected' },
      { attempts: 3, backoff: { type: 'fixed', delay: 10 } },
    )
    const unknown = await emailQueue.add(
      'sendSomethingElse',
      { email: 'unknown@example.invalid', name: 'Unknown' },
      { attempts: 3 },
    )
    await waitFor(async () => (await db.deadLetterJob.count()) === 2)
    await drainDeadLetterWrites()
    assert.equal(send.mock.callCount(), 1)
    const dead = await db.deadLetterJob.findMany({ orderBy: { jobName: 'asc' } })
    assert.deepEqual(
      dead.map((row) => [row.jobName, row.jobId, row.attemptsMade]),
      [
        ['sendSomethingElse', unknown.id, 1],
        ['sendVerificationSuccessEmail', rejected.id, 1],
      ],
    )
    assert.match(dead[1].failedReason, /SMTP rejected the message: 550/)
    assert.deepEqual(dead[1].payload, { email: 'rejected@example.invalid', name: 'Rejected' })
    assert.equal(await redis.get(`email:sent:${rejected.id}`), null)
  } finally {
    await worker.close()
  }
})

test('email: a failed dead-letter write is logged and the worker keeps processing', async (t) => {
  fakeTransport(t, [
    smtpError('550 first', { responseCode: 550 }),
    smtpError('550 second', { responseCode: 550 }),
  ])
  const record = t.mock.method(deadLetterRepository, 'record', async () => {
    throw new Error('dead-letter store unavailable')
  })
  const errors = t.mock.method(logger, 'error', () => logger)
  const worker = testWorker()
  attachWorkerLogging(worker)
  try {
    for (const email of ['first@example.invalid', 'second@example.invalid'])
      await emailQueue.add(
        'sendVerificationSuccessEmail',
        { email, name: 'User' },
        { attempts: 1 },
      )
    await waitFor(() => record.mock.callCount() === 2)
    await drainDeadLetterWrites()
    assert.equal(
      errors.mock.calls.filter(
        (call) =>
          (call.arguments as unknown[])[0] === 'Failed to record a dead-letter job',
      ).length,
      2,
    )
    assert.equal(await db.deadLetterJob.count(), 0)
  } finally {
    await worker.close()
  }
})

test('email: link jobs without a token fail permanently and send nothing', async (t) => {
  const { sent } = fakeTransport(t)
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

test('email: reset links point at PASSWORD_RESET_URL with the token', async (t) => {
  const { sent } = fakeTransport(t)
  await processEmailJob({
    id: '2',
    name: 'sendResetPasswordEmail',
    data: { email: 'user@example.invalid', name: 'User', token: 'reset-token' },
  } as unknown as Job)
  assert.equal(linkOf(sent[0]), 'http://test.invalid/reset-password?token=reset-token')
})
