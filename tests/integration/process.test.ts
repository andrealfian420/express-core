// Purpose: Run the real API and worker entrypoints as child processes and verify configuration
//   loading (order and precedence), scheduler ownership, visible production logs, job
//   processing, and that SIGTERM releases every resource (exit code 0 without forcing).
// Caller: Node integration runner.
// Dependencies: Compiled entrypoints in .test-build/src, Supertest, isolated PostgreSQL/Redis,
//   actor fixtures, outbox repository.
// Main Functions: API process (configuration, scheduler absence, production request logging)
//   and worker process cases.
// Side Effects: Starts child processes on port 3101 (API) and against the test services;
//   writes temporary working directories, a `.env` fixture and a module report, all removed
//   in `finally` together with any child process still running.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import supertest = require('supertest')
import { setupIntegration, actor, db, waitFor } from '../support/integration'
import outboxRepository from '../../src/modules/outbox/outbox.repository'
import { hashToken } from '../../src/utils/token'

setupIntegration()

const SOURCE = path.resolve(__dirname, '../../src')
const API_PORT = 3101

// Records which scheduler modules a child process loaded, written when it exits.
const PRELOAD = `
const fs = require('fs')
process.on('exit', () => {
  const loaded = Object.keys(require.cache).filter((file) => /node-cron|[\\\\/]jobs[\\\\/]cron[\\\\/]/.test(file))
  fs.writeFileSync(process.env.TEST_MODULE_REPORT, JSON.stringify(loaded))
})
`

interface Child {
  proc: ChildProcess
  output: () => string
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  report: () => string[]
}

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-core-test-proc-'))
  fs.writeFileSync(path.join(dir, 'preload.cjs'), PRELOAD)
  return dir
}

function start(entry: string, dir: string, env: NodeJS.ProcessEnv): Child {
  const reportFile = path.join(dir, 'modules.json')
  const proc = spawn(
    process.execPath,
    ['--require', path.join(dir, 'preload.cjs'), path.join(SOURCE, entry)],
    {
      cwd: dir,
      env: { ...env, TEST_MODULE_REPORT: reportFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  proc.stdout!.on('data', (chunk) => (output += chunk))
  proc.stderr!.on('data', (chunk) => (output += chunk))
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })),
  )
  return {
    proc,
    output: () => output,
    exited,
    report: () => JSON.parse(fs.readFileSync(reportFile, 'utf8')),
  }
}

// SIGTERM, then wait for a natural exit; a leaked handle shows up as a timeout here.
async function terminate(child: Child, timeoutMs = 10_000) {
  child.proc.kill('SIGTERM')
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  try {
    return await Promise.race([child.exited, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function cleanup(child: Child | undefined, dir: string) {
  if (child && child.proc.exitCode === null && child.proc.signalCode === null)
    child.proc.kill('SIGKILL')
  fs.rmSync(dir, { recursive: true, force: true })
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter((line): line is Record<string, unknown> => line !== null && typeof line === 'object')
}

test('api process: .env fills only missing settings before modules read them, never loads cron, exits 0 on SIGTERM', async () => {
  const dir = workspace()
  fs.writeFileSync(
    path.join(dir, '.env'),
    [
      'ALLOWED_ORIGINS=http://dotenv.invalid',
      'PORT=3199',
      'DATABASE_URL=postgresql://nobody:nothing@127.0.0.1:1/missing',
    ].join('\n'),
  )
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
  }
  delete env.ALLOWED_ORIGINS
  let api: Child | undefined
  try {
    api = start('server.js', dir, env)
    const http = supertest(`http://127.0.0.1:${API_PORT}`)
    await waitFor(
      () => http.get('/api/v1/health').then((r) => r.ok, () => false),
      15_000,
    )
    // The real environment wins: this port and the test database, not the .env values.
    await http.get('/api/v1/health/ready').expect(200)
    // The .env file supplied the missing allowlist before CORS/origin modules evaluated it.
    await http.get('/api/v1/health').set('Origin', 'http://dotenv.invalid').expect(200)
    await http.get('/api/v1/health').set('Origin', 'http://test.invalid').expect(403)
    assert.match(api.output(), new RegExp(`Server is running on port ${API_PORT}`))

    assert.deepEqual(await terminate(api), { code: 0, signal: null })
    assert.deepEqual(api.report(), [])
    assert.match(api.output(), /Shutdown complete \(SIGTERM\)/)
  } finally {
    cleanup(api, dir)
  }
})

test('api process (production): ENABLELOG=false logs no requests; ENABLELOG=true logs them as JSON on stdout and writes no files', async () => {
  for (const [flag, expectRequestLine] of [
    ['false', false],
    ['true', true],
  ] as const) {
    const dir = workspace()
    let api: Child | undefined
    try {
      api = start('server.js', dir, {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        ENABLELOG: flag,
      })
      const http = supertest(`http://127.0.0.1:${API_PORT}`)
      await waitFor(
        () => http.get('/api/v1/health').then((r) => r.ok, () => false),
        15_000,
      )
      await http.get('/api/v1/does-not-exist').expect(404)
      assert.deepEqual(await terminate(api), { code: 0, signal: null })

      const requestLines = jsonLines(api.output()).filter(
        (line) => line.context === 'http',
      )
      assert.equal(requestLines.length > 0, expectRequestLine, `ENABLELOG=${flag}`)
      if (expectRequestLine)
        assert.ok(
          requestLines.some(
            (line) =>
              line.level === 'warn' &&
              String(line.message).includes('"GET /api/v1/does-not-exist" 404'),
          ),
        )
      // Regression: Morgan used to open client/storage/http-*.log, which crashed read-only containers.
      assert.equal(fs.existsSync(path.join(dir, 'client')), false)
    } finally {
      cleanup(api, dir)
    }
  }
})

test('worker process: production logs are JSON on stdout, it owns the schedules, relays outbox intents, processes jobs and exits 0 on SIGTERM', async () => {
  const dir = workspace()
  let worker: Child | undefined
  try {
    worker = start('jobs/run-workers.js', dir, {
      ...process.env,
      NODE_ENV: 'production',
    })
    await waitFor(
      () =>
        jsonLines(worker!.output()).some(
          (line) => line.message === 'Started 2 workers and 2 schedules',
        ),
      15_000,
    )

    const { user } = await actor()
    await db.refreshToken.create({
      data: { token: hashToken('expired'), userId: user.id, expiresAt: new Date(0) },
    })
    // An intent committed by any process is published by this worker's relay and processed.
    await db.$transaction((tx) =>
      outboxRepository.enqueue(tx, 'system', 'cleanupExpiredTokens', {}),
    )
    await waitFor(async () => (await db.refreshToken.count()) === 0, 10_000)
    assert.equal((await db.outbox.findFirstOrThrow()).status, 'PUBLISHED')

    assert.deepEqual(await terminate(worker), { code: 0, signal: null })
    const lines = jsonLines(worker.output())
    assert.ok(
      lines.some(
        (line) =>
          line.level === 'info' &&
          line.message === 'Shutdown complete (SIGTERM)' &&
          typeof line.timestamp === 'string',
      ),
    )
    assert.ok(worker.report().some((file) => file.includes('node-cron')))
  } finally {
    cleanup(worker, dir)
  }
})
