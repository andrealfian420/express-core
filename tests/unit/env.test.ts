// Purpose: Verify configuration validation: defaults, boolean parsing, fail-fast errors without
//   leaking values, and production secret strength.
// Caller: Node unit runner.
// Dependencies: src/config/env (parseEnv and the live env of the test process).
// Main Functions: parseEnv regression cases.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import { env, parseEnv } from '../../src/config/env'

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
  JWT_ACCESS_SECRET: 'a-development-secret',
  APP_URL: 'http://localhost:3001',
  PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
}

function failure(source: Record<string, string | undefined>): string {
  try {
    parseEnv(source)
  } catch (error) {
    return (error as Error).message
  }
  assert.fail(`expected invalid configuration for ${Object.keys(source)}`)
}

test('env: the test process is configured by the runner, not by a .env file', () => {
  assert.equal(env.NODE_ENV, 'test')
  assert.equal(env.APP_URL, 'http://test.invalid')
  assert.deepEqual(env.ALLOWED_ORIGINS, ['http://test.invalid'])
  assert.ok(Object.isFrozen(env))
})

test('env: defaults match the previous inline fallbacks and blank values count as unset', () => {
  const parsed = parseEnv({ ...base, PORT: '', BCRYPT_ROUNDS: '  ' })
  assert.equal(parsed.NODE_ENV, undefined)
  assert.equal(parsed.PORT, 3001)
  assert.equal(parsed.APP_NAME, 'App')
  assert.equal(parsed.FORMLIMIT, '52428800')
  assert.equal(parsed.ENABLELOG, false)
  assert.equal(parsed.LOG_TO_FILES, false)
  assert.deepEqual(parsed.ALLOWED_ORIGINS, [])
  assert.equal(parsed.REDIS_HOST, '127.0.0.1')
  assert.equal(parsed.REDIS_PORT, 6379)
  assert.equal(parsed.JWT_ACCESS_EXPIRES, '15m')
  assert.equal(parsed.REFRESH_TOKEN_EXPIRES_DAYS, 7)
  assert.equal(parsed.EMAIL_VERIFICATION_EXPIRES_HOURS, 24)
  assert.equal(parsed.PASSWORD_RESET_EXPIRES_MINUTES, 60)
  assert.equal(parsed.BCRYPT_ROUNDS, 10)
  assert.equal(parsed.SMTP_PORT, 587)
  assert.equal(parsed.MAIL_DRIVER, 'smtp')
  assert.equal(parsed.OUTBOX_RELAY_INTERVAL_MS, 2000)
  assert.equal(parsed.OUTBOX_RELAY_BATCH, 50)
  assert.equal(parsed.OUTBOX_LEASE_SECONDS, 60)
  assert.equal(parsed.OUTBOX_MAX_PUBLISH_ATTEMPTS, 5)
  assert.equal(parsed.OUTBOX_RETENTION_PUBLISHED_DAYS, 7)
  assert.equal(parsed.OUTBOX_RETENTION_FAILED_DAYS, 30)
  assert.equal(parsed.DLQ_RETENTION_DAYS, 90)
})

test('env: flags are real booleans, so ENABLELOG=false disables logging', () => {
  for (const [value, expected] of [
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['off', false],
    ['true', true],
    ['Yes', true],
    ['1', true],
  ] as const)
    assert.equal(parseEnv({ ...base, ENABLELOG: value }).ENABLELOG, expected, value)
  assert.match(failure({ ...base, LOG_TO_FILES: 'maybe' }), /LOG_TO_FILES: must be true or false/)
})

test('env: missing and malformed values fail fast, naming every key and no value', () => {
  const missing = failure({})
  for (const key of [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'APP_URL',
    'PASSWORD_RESET_URL',
  ])
    assert.match(missing, new RegExp(`${key}: is required`))

  const malformed = failure({
    ...base,
    JWT_ACCESS_SECRET: 'super-secret-value-that-must-not-leak',
    DATABASE_URL: 'mysql://user:hunter2@localhost/app',
    APP_URL: 'localhost:3001',
    PORT: '70000',
    BCRYPT_ROUNDS: '3',
    JWT_ACCESS_EXPIRES: '900',
    FORMLIMIT: 'lots',
    ALLOWED_ORIGINS: 'http://localhost:5173/,https://app.example.com',
    PASSWORD_RESET_URL: '/reset-password',
    MAIL_DRIVER: 'sendmail',
    OUTBOX_LEASE_SECONDS: '5',
  })
  for (const key of [
    'DATABASE_URL',
    'APP_URL',
    'PORT',
    'BCRYPT_ROUNDS',
    'JWT_ACCESS_EXPIRES',
    'FORMLIMIT',
    'ALLOWED_ORIGINS',
    'PASSWORD_RESET_URL',
    'MAIL_DRIVER',
    'OUTBOX_LEASE_SECONDS',
  ])
    assert.match(malformed, new RegExp(`${key}: `))
  assert.doesNotMatch(malformed, /super-secret|hunter2/)
})

test('env: production rejects the example secret and short secrets; other environments allow them', () => {
  assert.match(
    failure({
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'change_this_to_a_secure_random_string',
    }),
    /JWT_ACCESS_SECRET: still uses the \.env\.example placeholder/,
  )
  assert.match(
    failure({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short-secret' }),
    /JWT_ACCESS_SECRET: must be at least 32 characters in production/,
  )
  const strong = 'x'.repeat(32)
  assert.equal(
    parseEnv({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: strong })
      .JWT_ACCESS_SECRET,
    strong,
  )
  assert.equal(
    parseEnv({ ...base, JWT_ACCESS_SECRET: 'change_this_to_a_secure_random_string' })
      .JWT_ACCESS_SECRET.length > 0,
    true,
  )
})

test('env: accepted formats for origins, durations and sizes', () => {
  const parsed = parseEnv({
    ...base,
    ALLOWED_ORIGINS: ' https://app.example.com , http://localhost:5173 ',
    JWT_ACCESS_EXPIRES: '2 hours',
    FORMLIMIT: '50mb',
    DATABASE_URL: 'postgres://u:p@db:5432/app?schema=public',
  })
  assert.deepEqual(parsed.ALLOWED_ORIGINS, [
    'https://app.example.com',
    'http://localhost:5173',
  ])
  assert.equal(parsed.JWT_ACCESS_EXPIRES, '2 hours')
  assert.equal(parsed.FORMLIMIT, '50mb')
})
