// Purpose: Verify the shared graceful-shutdown sequence: ordering, failure handling,
//   idempotence and the forced exit when a step hangs.
// Caller: Node unit runner.
// Dependencies: src/utils/graceful-shutdown, an in-memory logger double.
// Main Functions: createShutdown cases.
// Side Effects: None; process.exit is replaced by an injected function.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createShutdown } from '../../src/utils/graceful-shutdown'

function recorder() {
  const entries: string[] = []
  return {
    entries,
    logger: {
      info: (message: string) => entries.push(`info ${message}`),
      error: (message: string) => entries.push(`error ${message}`),
    },
  }
}

test('shutdown: runs every step in order and resolves 0 when all succeed', async () => {
  const calls: string[] = []
  const { logger } = recorder()
  const shutdown = createShutdown({
    timeoutMs: 1_000,
    logger,
    forceExit: () => assert.fail('must not force exit'),
    steps: ['server', 'queues', 'database', 'redis'].map((name) => ({
      name,
      run: async () => {
        calls.push(name)
      },
    })),
  })
  assert.equal(await shutdown('SIGTERM'), 0)
  assert.deepEqual(calls, ['server', 'queues', 'database', 'redis'])
})

test('shutdown: a failing step is logged, later steps still run and the exit code is 1', async () => {
  const calls: string[] = []
  const { logger, entries } = recorder()
  const shutdown = createShutdown({
    timeoutMs: 1_000,
    logger,
    steps: [
      {
        name: 'queues',
        run: () => {
          throw new Error('queue close failed')
        },
      },
      { name: 'redis', run: async () => calls.push('redis') },
    ],
  })
  assert.equal(await shutdown('SIGINT'), 1)
  assert.deepEqual(calls, ['redis'])
  assert.ok(entries.includes('error Shutdown step failed: queues'))
})

test('shutdown: fatal reasons exit 1 and repeated signals reuse the first run', async () => {
  let runs = 0
  const { logger } = recorder()
  const shutdown = createShutdown({
    timeoutMs: 1_000,
    logger,
    steps: [{ name: 'only', run: async () => runs++ }],
  })
  const first = shutdown('uncaughtException', true)
  const second = shutdown('SIGTERM')
  assert.equal(first, second)
  assert.equal(await first, 1)
  assert.equal(runs, 1)
})

test('shutdown: a hanging step triggers a forced exit with code 1 after the timeout', async () => {
  const exits: number[] = []
  const { logger, entries } = recorder()
  const shutdown = createShutdown({
    timeoutMs: 20,
    logger,
    forceExit: (code) => exits.push(code),
    steps: [{ name: 'stuck', run: () => new Promise(() => {}) }],
  })
  void shutdown('SIGTERM')
  const deadline = Date.now() + 2_000
  while (!exits.length && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(exits, [1])
  assert.ok(entries.some((entry) => entry.includes('forcing exit')))
})
