// Purpose: Verify the transactional outbox and its relay: atomic intents, disjoint concurrent
//   claims, lease recovery, idempotent publishing, retry/backoff, atomic dead-lettering, the
//   relay drain on stop, and bounded retention.
// Caller: Node integration runner.
// Dependencies: Outbox and dead-letter repositories, outbox relay, system service, BullMQ
//   queues, isolated PostgreSQL/Redis.
// Main Functions: Outbox claim/publish/failure/retention cases.
// Side Effects: Writes isolated outbox, queue and dead-letter records; one case installs a
//   temporary trigger on dead_letter_jobs and always drops it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import {
  setupIntegration,
  db,
  assertTestDatabase,
  waitFor,
} from '../support/integration'
import outbox from '../../src/modules/outbox/outbox.repository'
import deadLetter from '../../src/modules/dead-letter/dead-letter.repository'
import system from '../../src/services/system.service'
import {
  processRow,
  runOutboxRelayOnce,
  startOutboxRelay,
  stopOutboxRelay,
  retryDelaySeconds,
} from '../../src/jobs/relay/outbox-relay'
import emailQueue from '../../src/jobs/queues/email.queue'

setupIntegration()

const intent = (data: Prisma.InputJsonObject = {}) =>
  db.$transaction((tx) => outbox.enqueue(tx, 'email', 'sendVerificationSuccessEmail', data))

test('outbox: an intent written in a rolled-back transaction disappears with it', async () => {
  await assert.rejects(() =>
    db.$transaction(async (tx) => {
      await outbox.enqueue(tx, 'email', 'sendVerificationEmail', { token: 't' })
      throw new Error('rollback')
    }),
  )
  assert.equal(await db.outbox.count(), 0)
})

test('outbox: concurrent claims are disjoint, leased rows are invisible until the lease expires', async () => {
  for (let i = 0; i < 6; i++) await intent({ i })
  const [a, b] = await Promise.all([outbox.claimBatch(3), outbox.claimBatch(3)])
  const ids = [...a, ...b].map((row) => String(row.id))
  assert.equal(ids.length, 6)
  assert.equal(new Set(ids).size, 6)
  assert.equal((await outbox.claimBatch(10)).length, 0)

  // A relay that died mid-publish: once its lease has passed, the rows are claimable again.
  await db.outbox.updateMany({ data: { availableAt: new Date(Date.now() - 1000) } })
  assert.equal((await outbox.claimBatch(10)).length, 6)
})

test('outbox: publishing is idempotent per row and clears the stored payload', async () => {
  await intent({ email: 'user@example.invalid', name: 'User' })
  const [row] = await outbox.claimBatch(1)
  assert.equal(await processRow(row), 'published')
  // A second relay holding the same (expired) lease republishes: same job id, no new job.
  assert.equal(await processRow(row), 'skipped')
  assert.equal(await emailQueue.count(), 1)
  const job = await emailQueue.getJob(`outbox-${row.id}`)
  assert.deepEqual(job?.data, { email: 'user@example.invalid', name: 'User' })
  const saved = await db.outbox.findUniqueOrThrow({ where: { id: row.id } })
  assert.equal(saved.status, 'PUBLISHED')
  assert.deepEqual(saved.payload, {})
  assert.ok(saved.publishedAt)
})

test('outbox: Redis unavailable keeps the intent, defers it with backoff and leaves the rest of the batch leased', async (t) => {
  await intent({ n: 1 })
  await intent({ n: 2 })
  t.mock.method(emailQueue, 'add', async () => {
    throw new Error('Connection is closed')
  })
  assert.equal(await runOutboxRelayOnce(), 0)
  const rows = await db.outbox.findMany({ orderBy: { id: 'asc' } })
  assert.deepEqual(
    rows.map((row) => [row.status, row.attempts, row.lastError]),
    [
      ['PENDING', 1, 'Connection is closed'],
      ['PENDING', 0, null],
    ],
  )
  const delay = rows[0].availableAt.getTime() - Date.now()
  assert.ok(delay > 5_000 && delay <= retryDelaySeconds(1) * 1000, String(delay))
  assert.ok(rows[1].availableAt.getTime() > Date.now())
  assert.equal(await db.deadLetterJob.count(), 0)
})

test('outbox: exhausted publish attempts and unknown queues are dead-lettered atomically', async (t) => {
  await intent({ token: 'abc' })
  await db.outbox.updateMany({ data: { attempts: 4 } })
  await db.$transaction((tx) => outbox.enqueue(tx, 'missing', 'anything', { x: 1 }))
  t.mock.method(emailQueue, 'add', async () => {
    throw new Error('Connection is closed')
  })
  const rows = await outbox.claimBatch(10)
  assert.deepEqual(
    await Promise.all(rows.map((row) => processRow(row))),
    ['failed', 'failed'],
  )
  const failed = await db.outbox.findMany({ orderBy: { id: 'asc' } })
  assert.deepEqual(
    failed.map((row) => [row.status, row.attempts]),
    [
      ['FAILED', 5],
      ['FAILED', 1],
    ],
  )
  const dead = await db.deadLetterJob.findMany({ orderBy: { queueName: 'asc' } })
  assert.deepEqual(
    dead.map((row) => [row.queueName, row.jobId, row.attemptsMade, row.payload]),
    [
      ['email', `outbox-${failed[0].id}`, 5, { token: 'abc' }],
      ['missing', `outbox-${failed[1].id}`, 1, { x: 1 }],
    ],
  )
  assert.match(dead[0].failedReason, /Publish failed after 5 attempts: Connection is closed/)
  assert.equal(dead[1].failedReason, 'Unknown queue: missing')
})

test('outbox: if the dead-letter insert fails, the row stays PENDING (no half-failed state)', async () => {
  await assertTestDatabase()
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_reject_dead_letter() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'dead-letter insert rejected'; END $$ LANGUAGE plpgsql`)
  await db.$executeRawUnsafe(`
    CREATE TRIGGER test_reject_dead_letter BEFORE INSERT ON dead_letter_jobs
    FOR EACH ROW EXECUTE FUNCTION test_reject_dead_letter()`)
  try {
    await db.$transaction((tx) => outbox.enqueue(tx, 'missing', 'anything', {}))
    const [row] = await outbox.claimBatch(1)
    await assert.rejects(() => processRow(row), /dead-letter insert rejected/)
    const saved = await db.outbox.findUniqueOrThrow({ where: { id: row.id } })
    assert.equal(saved.status, 'PENDING')
    assert.equal(saved.attempts, 0)
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_reject_dead_letter ON dead_letter_jobs')
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_reject_dead_letter()')
  }
})

test('outbox: stopping the relay waits for the pass in progress', async (t) => {
  await intent({ slow: true })
  const add = emailQueue.add.bind(emailQueue)
  const slowAdd = t.mock.method(
    emailQueue,
    'add',
    async (...args: Parameters<typeof emailQueue.add>) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return add(...args)
    },
  )
  startOutboxRelay()
  try {
    await waitFor(() => slowAdd.mock.callCount() === 1, 5_000)
  } finally {
    // Called while the publish is still sleeping: it must wait for the pass to finish.
    await stopOutboxRelay()
  }
  const saved = await db.outbox.findFirstOrThrow()
  assert.equal(saved.status, 'PUBLISHED')
  assert.equal(await emailQueue.count(), 1)
})

test('retention: only terminal rows past their window are removed, in bounded batches', async () => {
  const days = (n: number) => new Date(Date.now() - n * 86_400_000)
  const rows = [
    ['PUBLISHED', days(8)],
    ['PUBLISHED', days(8)],
    ['PUBLISHED', days(8)],
    ['PUBLISHED', days(6)],
    ['FAILED', days(31)],
    ['FAILED', days(29)],
    ['PENDING', days(400)],
  ] as const
  for (const [status, availableAt] of rows)
    await db.outbox.create({
      data: { queueName: 'email', jobName: 'x', payload: {}, status, availableAt },
    })
  assert.equal(await outbox.prune('PUBLISHED', days(7), 2), 3)
  assert.deepEqual(await system.cleanupOutbox(), { published: 0, failed: 1 })
  const left = await db.outbox.findMany({ orderBy: { id: 'asc' } })
  assert.deepEqual(
    left.map((row) => row.status),
    ['PUBLISHED', 'FAILED', 'PENDING'],
  )

  for (const createdAt of [days(91), days(91), days(89)])
    await db.deadLetterJob.create({
      data: {
        queueName: 'email',
        jobName: 'x',
        payload: {},
        failedReason: 'failure',
        attemptsMade: 1,
        createdAt,
      },
    })
  assert.equal(await deadLetter.prune(days(90), 1), 2)
  assert.equal(await system.cleanupDeadLetterJobs(), 0)
  assert.equal(await db.deadLetterJob.count(), 1)
})
