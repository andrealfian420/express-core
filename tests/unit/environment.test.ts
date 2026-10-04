// Purpose: Prove the migration and cleanup guard rejects non-test resources.
// Caller: Node unit runner.
// Dependencies: scripts/test-environment.cjs, Node assertions.
// Main Functions: Unsafe environment rejection cases.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
const { assertTarget } = require('../../../scripts/test-environment.cjs')

const safe = { ...process.env, TEST_RESOURCE_OWNER: 'express-core-test' }

test('environment: allow only explicitly declared test targets', () => {
  assert.doesNotThrow(() => assertTarget(safe))
  for (const overrides of [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'development' },
    {
      DATABASE_URL:
        'postgresql://express_core_test:express_core_test@localhost:5432/db_express',
    },
    {
      DATABASE_URL:
        'postgresql://postgres:express_core_test@localhost:5432/express_core_test',
    },
    {
      DATABASE_URL:
        'postgresql://express_core_test:root@localhost:5432/express_core_test',
    },
    {
      DATABASE_URL:
        'postgresql://express_core_test:express_core_test@db.example.com:5432/express_core_test',
    },
    { REDIS_HOST: 'cache.example.com' },
    { REDIS_PASSWORD: 'secret' },
    { STORAGE_ROOT: '/app/client/storage/public' },
    { STORAGE_ROOT: '' },
    { TEST_RESOURCE_OWNER: '' },
    { TEST_RESOURCE_OWNER: 'forte-api-test' },
  ])
    assert.throws(
      () => assertTarget({ ...safe, ...overrides }),
      `expected rejection for ${JSON.stringify(overrides)}`,
    )
})
