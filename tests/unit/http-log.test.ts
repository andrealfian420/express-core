// Purpose: Verify HTTP request logging goes through the application logger (no log files) with
//   the expected levels and skip rules.
// Caller: Node unit runner.
// Dependencies: Express, Supertest, http-log middleware, mocked Winston logger methods.
// Main Functions: Enabled/disabled, success/error and non-API request cases.
// Side Effects: Creates temporary in-process HTTP listeners only.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import supertest = require('supertest')
import logger from '../../src/config/logger'
import { createHttpLogMiddleware } from '../../src/middleware/http-log.middleware'

function app(logSuccess: boolean) {
  const app = express()
  for (const handler of createHttpLogMiddleware({ enabled: true, logSuccess }))
    app.use(handler)
  app.get('/api/v1/ok', (_req, res) => res.sendStatus(200))
  app.get('/api/v1/missing', (_req, res) => res.sendStatus(404))
  app.get('/api/v1/broken', (_req, res) => res.sendStatus(500))
  app.get('/storage/file.png', (_req, res) => res.sendStatus(200))
  return supertest(app)
}

async function settle(check: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!check() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5))
}

test('http log: disabled logging installs no middleware', () => {
  assert.deepEqual(
    createHttpLogMiddleware({ enabled: false, logSuccess: true }),
    [],
  )
})

test('http log: API successes at info (development), errors at warn, other paths skipped', async (t) => {
  const info = t.mock.method(logger, 'info', () => logger)
  const warn = t.mock.method(logger, 'warn', () => logger)
  const http = app(true)
  await http.get('/api/v1/ok').expect(200)
  await http.get('/api/v1/missing').expect(404)
  await http.get('/storage/file.png').expect(200)
  await settle(() => info.mock.callCount() >= 1 && warn.mock.callCount() >= 1)
  assert.equal(info.mock.callCount(), 1)
  assert.match(String(info.mock.calls[0].arguments[0]), /"GET \/api\/v1\/ok" 200/)
  assert.deepEqual((info.mock.calls[0].arguments as unknown[])[1], {
    context: 'http',
  })
  assert.equal(warn.mock.callCount(), 1)
  assert.match(String(warn.mock.calls[0].arguments[0]), /"GET \/api\/v1\/missing" 404/)
})

test('http log: outside development only failed API requests are logged', async (t) => {
  const info = t.mock.method(logger, 'info', () => logger)
  const warn = t.mock.method(logger, 'warn', () => logger)
  const http = app(false)
  await http.get('/api/v1/ok').expect(200)
  await http.get('/api/v1/broken').expect(500)
  await settle(() => warn.mock.callCount() >= 1)
  assert.equal(info.mock.callCount(), 0)
  assert.equal(warn.mock.callCount(), 1)
  assert.match(String(warn.mock.calls[0].arguments[0]), /"GET \/api\/v1\/broken" 500/)
})
