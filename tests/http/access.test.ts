// Purpose: Verify protected module access, public health endpoints and helper contracts over HTTP.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, disposable actor fixtures.
// Main Functions: Access matrix, helper options, health and unknown-route cases.
// Side Effects: Reads and writes isolated test resources only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor } from '../support/integration'
import { api } from '../support/http'

setupIntegration()

for (const module of ['roles', 'users', 'activity-logs'])
  test(`${module}: anonymous denied, missing permission denied, authorized list succeeds`, async () => {
    await api('get', `/${module}`).expect(401)
    const denied = await actor([])
    await api('get', `/${module}`, denied.token).expect(403)
    const admin = await actor()
    const response = await api('get', `/${module}`, admin.token).expect(200)
    assert.equal(response.body.success, true)
    assert.ok(Array.isArray(response.body.data.data))
    assert.equal(typeof response.body.data.meta.total, 'number')
  })

test('helper: role options require authentication and return label/value pairs', async () => {
  await api('get', '/utils/role-options').expect(401)
  const admin = await actor()
  const result = await api('get', '/utils/role-options', admin.token).expect(200)
  assert.deepEqual(result.body.data, [
    { label: admin.role.title, value: admin.role.id },
  ])
})

test('health: liveness and readiness are public; invalid bearer token is denied', async () => {
  const live = await api('get', '/health').expect(200)
  assert.equal(live.body.status, 'OK')
  const ready = await api('get', '/health/ready').expect(200)
  assert.equal(ready.body.status, 'READY')
  await api('get', '/profile', 'invalid').expect(401)
})

test('routing: the API root and unknown paths return 404', async () => {
  await api('get', '/').expect(404)
  const admin = await actor()
  await api('get', '/does-not-exist', admin.token).expect(404)
})
