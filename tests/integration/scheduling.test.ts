// Purpose: Verify maintenance schedules (registration, job payload/options, time-slot
//   deduplication that survives completion, enqueue failures) and Redis-backed rate limiting.
// Caller: Node integration runner.
// Dependencies: node-cron (mocked schedule), system queue, a test-owned BullMQ worker,
//   Express, Supertest and isolated Redis.
// Main Functions: Cron registration/enqueue/dedup cases and rate-limit boundary cases.
// Side Effects: Writes only test queue and limiter keys; no real cron timers are started;
//   the test-owned worker is closed in `finally`.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import supertest = require('supertest')
import cron from 'node-cron'
import { Worker } from 'bullmq'
import { setupIntegration, waitFor } from '../support/integration'
import startCronJobs, {
  SCHEDULES,
  enqueueScheduled,
  scheduledJobOptions,
  slotKey,
} from '../../src/jobs/cron'
import systemQueue from '../../src/jobs/queues/system.queue'
import redis from '../../src/config/redis'
import { QUEUE_NAMES } from '../../src/jobs/config/queue.constants'
import { createRateLimiter } from '../../src/middleware/rate-limit.middleware'

setupIntegration()

const tenAm = new Date('2026-10-04T10:00:00.000Z')

test('cron: slot ids are deterministic UTC hour/day keys and options keep the slot job', () => {
  assert.equal(slotKey('hour', new Date('2026-10-04T10:59:59.999Z')), '2026-10-04T10')
  assert.equal(slotKey('day', new Date('2026-10-04T23:30:00.000Z')), '2026-10-04')
  assert.deepEqual(scheduledJobOptions('cleanupExpiredTokens', 'hour', tenAm), {
    jobId: 'cleanupExpiredTokens-2026-10-04T10',
    removeOnComplete: { age: 7_200 },
    removeOnFail: { age: 7_200 },
  })
})

test('cron: register the hourly cleanup; repeated ticks enqueue one job with an empty payload and options as options', async (t) => {
  const schedules: { expression: string; callback: () => Promise<void> }[] = []
  t.mock.method(cron, 'schedule', (expression: string, callback: any) => {
    schedules.push({ expression, callback })
    return { destroy: () => undefined } as any
  })
  const tasks = startCronJobs()
  assert.equal(tasks.length, SCHEDULES.length)
  assert.deepEqual(
    schedules.map((s) => s.expression),
    ['0 * * * *'],
  )
  // Two ticks in one slot (e.g. two worker processes) must produce a single job.
  for (const s of schedules) {
    await s.callback()
    await s.callback()
  }
  const waiting = await systemQueue.getWaiting()
  assert.equal(waiting.length, 1)
  const [job] = waiting
  assert.equal(job.name, 'cleanupExpiredTokens')
  // Regression: the options object used to be passed as the job payload.
  assert.deepEqual(job.data, {})
  assert.match(job.id!, /^cleanupExpiredTokens-\d{4}-\d{2}-\d{2}T\d{2}$/)
  assert.deepEqual(job.opts.removeOnComplete, { age: 7_200 })
})

test('cron: duplicate enqueues in one slot run once, even after the job completed', async () => {
  const [hourly] = SCHEDULES
  await enqueueScheduled(hourly, tenAm)
  await enqueueScheduled(hourly, new Date('2026-10-04T10:00:00.250Z'))
  assert.equal((await systemQueue.getWaiting()).length, 1)

  const processed: string[] = []
  const worker = new Worker(
    QUEUE_NAMES.SYSTEM,
    async (job) => {
      processed.push(job.id!)
    },
    { connection: redis },
  )
  try {
    await waitFor(async () => (await systemQueue.getCompletedCount()) === 1)
    // A second worker firing late in the same slot must not run the job again.
    await enqueueScheduled(hourly, new Date('2026-10-04T10:45:00.000Z'))
    await enqueueScheduled(hourly, new Date('2026-10-04T11:00:00.000Z'))
    await waitFor(async () => (await systemQueue.getCompletedCount()) === 2)
  } finally {
    await worker.close()
  }
  assert.deepEqual(processed, [
    'cleanupExpiredTokens-2026-10-04T10',
    'cleanupExpiredTokens-2026-10-04T11',
  ])
})

test('cron: a failed enqueue is logged and never escapes as an unhandled rejection', async (t) => {
  const schedules: (() => Promise<void>)[] = []
  t.mock.method(cron, 'schedule', (_expression: string, callback: any) => {
    schedules.push(callback)
    return { destroy: () => undefined } as any
  })
  t.mock.method(systemQueue, 'add', async () => {
    throw new Error('Redis unavailable')
  })
  startCronJobs()
  await assert.doesNotReject(schedules[0]())
})

test('rate-limit: exceeding the limit returns 429 with standard headers', async () => {
  const app = express()
  app.use(createRateLimiter({ max: 2, windowMs: 60000 }))
  app.get('/', (_req, res) => res.sendStatus(200))
  const http = supertest(app)
  await http.get('/').expect(200)
  await http.get('/').expect(200)
  const denied = await http.get('/').expect(429)
  assert.equal(denied.body.success, false)
  assert.ok(denied.headers['ratelimit-limit'])
})
