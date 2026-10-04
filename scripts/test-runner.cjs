// Purpose: Compile and run isolated Node test suites with CI reports.
// Caller: npm testing scripts, Makefile (through scripts/test-compose.sh) and CI.
// Dependencies: TypeScript, Node test runner, c8, Prisma, ioredis, scripts/test-environment.cjs.
// Main Functions: main, run, discover, testArgs, prepareServices.
// Side Effects: Compiles tests into .test-build, migrates the verified test DB, writes
//   test-results/ and coverage/ reports, removes the temporary storage root on exit.
const { spawnSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  configure,
  assertTarget,
  TEST_IDENTITY,
} = require('./test-environment.cjs')

const suite = process.argv[2] || 'unit'
const moduleFilter = process.argv
  .find((v) => v.startsWith('--module='))
  ?.slice(9)

configure()

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? result.signal})`)
}

function discover(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? discover(path.join(dir, e.name))
        : e.name.endsWith('.test.js')
          ? [path.join(dir, e.name)]
          : [],
    )
}

function testArgs(kind) {
  const files = discover(`.test-build/tests/${kind}`).filter(
    (f) => !moduleFilter || path.basename(f).includes(moduleFilter),
  )
  // An empty selection is a failure, never a silent success.
  if (!files.length)
    throw new Error(`No ${kind} tests match ${moduleFilter || 'suite'}`)
  return [
    '--test',
    '--test-concurrency=1',
    '--test-timeout=60000',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=junit',
    `--test-reporter-destination=test-results/${kind}.xml`,
    ...files,
  ]
}

// Wait for the disposable services, verify their live identity, then apply migrations.
async function prepareServices() {
  assertTarget()
  const { PrismaClient } = require('@prisma/client')
  const Redis = require('ioredis')
  const db = new PrismaClient()
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  })
  redis.on('error', () => {})
  try {
    for (let i = 0; i < 30; i++) {
      try {
        const [identity] = await db.$queryRawUnsafe(
          'SELECT current_database() AS db, current_user AS username',
        )
        if (
          identity.db !== TEST_IDENTITY.database ||
          identity.username !== TEST_IDENTITY.user
        )
          throw new Error('Unexpected DB identity')
        if (redis.status === 'wait' || redis.status === 'end')
          await redis.connect()
        await redis.ping()
        break
      } catch (err) {
        if (i === 29 || err.message === 'Unexpected DB identity') throw err
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  } finally {
    await db.$disconnect()
    redis.disconnect()
  }
  run('node_modules/.bin/prisma', ['migrate', 'deploy'])
}

async function main() {
  if (!['unit', 'integration', 'http', 'ci', 'watch'].includes(suite))
    throw new Error('Unknown suite')
  fs.mkdirSync('test-results', { recursive: true })
  fs.rmSync('.test-build', { recursive: true, force: true })
  for (const file of fs.readdirSync('test-results'))
    if (file.endsWith('.xml')) fs.rmSync(path.join('test-results', file))
  run('node_modules/.bin/prisma', ['generate'])
  run('node_modules/.bin/tsc', ['-p', 'tsconfig.test.json'])
  if (suite === 'watch') {
    const compile = spawn(
      'node_modules/.bin/tsc',
      ['-p', 'tsconfig.test.json', '--watch', '--preserveWatchOutput'],
      { stdio: 'inherit' },
    )
    const watch = spawn(process.execPath, ['--watch', ...testArgs('unit')], {
      stdio: 'inherit',
    })
    const stop = () => {
      compile.kill()
      watch.kill()
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    await new Promise((resolve) =>
      watch.on('exit', (code) => {
        compile.kill()
        process.exitCode = code || 0
        resolve()
      }),
    )
    return
  }
  const kinds = suite === 'ci' ? ['unit', 'integration', 'http'] : [suite]
  if (suite === 'ci') {
    fs.mkdirSync('coverage', { recursive: true })
    for (const entry of fs.readdirSync('coverage'))
      fs.rmSync(path.join('coverage', entry), { recursive: true, force: true })
  }
  let failed = false
  let servicesReady = false
  for (const kind of kinds) {
    try {
      if (kind !== 'unit' && !servicesReady) {
        await prepareServices()
        servicesReady = true
      }
      if (suite === 'ci')
        run('node_modules/.bin/c8', [
          ...Object.entries(require('./coverage.cjs')).flatMap(([key, value]) =>
            (Array.isArray(value) ? value : [value]).map(
              (v) => `--${key}=${v}`,
            ),
          ),
          '--clean=false',
          process.execPath,
          ...testArgs(kind),
        ])
      else run(process.execPath, testArgs(kind))
    } catch (error) {
      console.error(error.message)
      failed = true
    }
  }
  if (failed) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    if (
      process.env.STORAGE_ROOT?.startsWith(
        path.join(os.tmpdir(), TEST_IDENTITY.storagePrefix),
      )
    )
      fs.rmSync(process.env.STORAGE_ROOT, { recursive: true, force: true })
  })
