// Purpose: Provide HTTP requests over the real Express application.
// Caller: HTTP suites under tests/http.
// Dependencies: Supertest, src/app, tests/support/integration (guard runs first).
// Main Functions: request, api.
// Side Effects: Runs requests against ephemeral in-process HTTP listeners.
import './integration'
import supertest = require('supertest')
import app from '../../src/app'

export const request = supertest(app)

export function api(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  token?: string,
) {
  const req = request[method](`/api/v1${path}`)
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}
