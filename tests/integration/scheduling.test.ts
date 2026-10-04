// Purpose: Verify maintenance schedule registration and Redis-backed rate limiting.
// Caller: Node integration runner.
// Dependencies: node-cron (mocked schedule), system queue, Express, Supertest and isolated Redis.
// Main Functions: Cron callback enqueue and rate-limit boundary cases.
// Side Effects: Writes only test queue and limiter keys; no real cron timers are started.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import supertest = require('supertest')
import cron from 'node-cron'
import { setupIntegration } from '../support/integration'
import startCronJobs from '../../src/jobs/cron'
import systemQueue from '../../src/jobs/queues/system.queue'
import { createRateLimiter } from '../../src/middleware/rate-limit.middleware'

setupIntegration()

test('cron: register the hourly token cleanup and enqueue it on the system queue', async (t) => {
  const schedules: { expression: string; callback: () => Promise<void> }[] = []
  t.mock.method(cron, 'schedule', (expression: string, callback: any) => {
    schedules.push({ expression, callback })
    return {} as any
  })
  startCronJobs()
  assert.deepEqual(
    schedules.map((s) => s.expression),
    ['0 * * * *'],
  )
  for (const s of schedules) await s.callback()
  const jobs = await systemQueue.getWaiting()
  assert.deepEqual(
    jobs.map((j) => j.name),
    ['cleanupExpiredTokens'],
  )
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
