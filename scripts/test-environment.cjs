// Purpose: Establish and validate isolated test resources before application imports.
// Caller: scripts/test-runner.cjs, tests/support/integration.ts, unit environment tests.
// Dependencies: Node filesystem, OS, URL and assert modules.
// Main Functions: configure, assertTarget, TEST_IDENTITY.
// Side Effects: Sets dummy environment values and creates a temporary storage directory.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Single source of the disposable resource identity shared by the runner, guards and fixtures.
const TEST_IDENTITY = Object.freeze({
  owner: 'express-core-test',
  database: 'express_core_test',
  user: 'express_core_test',
  password: 'express_core_test',
  redisPassword: 'express_core_test',
  storagePrefix: 'express-core-test-',
})

function assertTarget(env = process.env) {
  assert.equal(env.NODE_ENV, 'test', 'Tests require NODE_ENV=test')
  assert.equal(
    env.TEST_RESOURCE_OWNER,
    TEST_IDENTITY.owner,
    'Missing isolated resource declaration',
  )
  const url = new URL(env.DATABASE_URL)
  assert.equal(
    url.pathname,
    `/${TEST_IDENTITY.database}`,
    'Refusing non-test database',
  )
  assert.equal(url.username, TEST_IDENTITY.user, 'Refusing non-test database user')
  assert.equal(
    url.password,
    TEST_IDENTITY.password,
    'Refusing non-test database credentials',
  )
  assert.ok(
    ['postgres', '127.0.0.1', 'localhost'].includes(url.hostname),
    'Unexpected database host',
  )
  assert.ok(
    ['redis', '127.0.0.1', 'localhost'].includes(env.REDIS_HOST),
    'Unexpected Redis host',
  )
  assert.equal(
    env.REDIS_PASSWORD,
    TEST_IDENTITY.redisPassword,
    'Refusing non-test Redis credentials',
  )
  assert.ok(
    env.STORAGE_ROOT &&
      path
        .resolve(env.STORAGE_ROOT)
        .startsWith(path.join(os.tmpdir(), TEST_IDENTITY.storagePrefix)),
    'Refusing non-test storage',
  )
}

function configure() {
  // An explicit declaration is required for service suites; never inherit application secrets.
  const dbHost = process.env.TEST_DB_HOST || '127.0.0.1'
  const { user, password, database } = TEST_IDENTITY
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${dbHost}:5432/${database}?schema=public`
  process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || '127.0.0.1'
  process.env.REDIS_PORT = '6379'
  process.env.REDIS_PASSWORD = TEST_IDENTITY.redisPassword
  process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-do-not-deploy'
  process.env.JWT_ACCESS_EXPIRES = '15m'
  process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7'
  process.env.EMAIL_VERIFICATION_EXPIRES_HOURS = '24'
  process.env.PASSWORD_RESET_EXPIRES_MINUTES = '30'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.ALLOWED_ORIGINS = 'http://test.invalid'
  process.env.APP_NAME = 'Express Core Test'
  process.env.APP_URL = 'http://test.invalid'
  process.env.PORT = '3001'
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = '1'
  process.env.SMTP_USER = 'test'
  process.env.SMTP_PASS = 'test'
  process.env.SMTP_FROM = 'Express Core Test <noreply@test.invalid>'
  delete process.env.ENABLELOG
  delete process.env.LOG_TO_FILES
  process.env.STORAGE_ROOT = fs.mkdtempSync(
    path.join(os.tmpdir(), TEST_IDENTITY.storagePrefix),
  )
}

module.exports = { configure, assertTarget, TEST_IDENTITY }
