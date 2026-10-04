// Purpose: Verify bearer authentication, the cookie-endpoint origin guard, request validation
//   and error contracts in isolation.
// Caller: Node unit runner.
// Dependencies: Express, Supertest, jsonwebtoken and middleware without persistence imports.
// Main Functions: Middleware boundary tests.
// Side Effects: Creates temporary in-process HTTP listeners only.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import supertest = require('supertest')
import jwt from 'jsonwebtoken'
import auth from '../../src/middleware/auth.middleware'
import origin from '../../src/middleware/origin-check.middleware'
import validate from '../../src/middleware/validate.middleware'
import errors from '../../src/middleware/error.middleware'
import AppError from '../../src/utils/appError'
import { loginSchema } from '../../src/modules/auth/auth.validation'

function app() {
  const app = express()
  app.use(express.json())
  app.get('/protected', auth, (req, res) => res.json(req.user))
  app.post('/cookie', origin, (_req, res) => res.sendStatus(204))
  app.get('/cookie', origin, (_req, res) => res.sendStatus(204))
  app.post('/validate', validate(loginSchema), (req, res) => res.json(req.body))
  app.get('/boom', () => {
    throw new Error('unexpected')
  })
  app.get('/teapot', () => {
    throw new AppError('Short and stout', 418)
  })
  app.use(errors)
  return supertest(app)
}

test('auth: cookie cannot replace Bearer; expired, malformed and foreign-secret tokens are denied', async () => {
  const http = app()
  await http.get('/protected').expect(401)
  await http
    .get('/protected')
    .set('Cookie', 'refreshToken=anything')
    .expect(401)
  await http.get('/protected').set('Authorization', 'Token abc').expect(401)
  const expired = jwt.sign({ sub: '1' }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: -1,
  })
  await http
    .get('/protected')
    .set('Authorization', `Bearer ${expired}`)
    .expect(401)
  const foreign = jwt.sign({ sub: '1' }, 'another-secret')
  await http
    .get('/protected')
    .set('Authorization', `Bearer ${foreign}`)
    .expect(401)
  const valid = jwt.sign({ sub: '7' }, process.env.JWT_ACCESS_SECRET!)
  const response = await http
    .get('/protected')
    .set('Authorization', `Bearer ${valid}`)
    .expect(200)
  assert.deepEqual(response.body, { sub: 7 })
})

test('validate: strips unknown fields and rejects malformed input without leaking a stack', async () => {
  const http = app()
  const response = await http
    .post('/validate')
    .send({ email: 'user@example.invalid', password: 'x', role: 'admin' })
    .expect(200)
  assert.deepEqual(response.body, {
    email: 'user@example.invalid',
    password: 'x',
  })
  const invalid = await http
    .post('/validate')
    .send({ email: 'bad' })
    .expect(400)
  assert.equal(invalid.body.success, false)
  assert.equal(invalid.body.message, 'Validation failed')
  assert.equal(invalid.body.stack, undefined)
})

test('error: AppError keeps its status and unknown errors become 500 outside development', async () => {
  const http = app()
  const teapot = await http.get('/teapot').expect(418)
  assert.deepEqual(teapot.body, { success: false, message: 'Short and stout' })
  const boom = await http.get('/boom').expect(500)
  assert.equal(boom.body.success, false)
  assert.equal(boom.body.stack, undefined)
})

test('origin guard: allowlisted Origin/Referer and header-less callers pass; foreign, null and malformed values are rejected', async () => {
  const http = app()
  await http.post('/cookie').set('Origin', 'http://test.invalid').expect(204)
  await http
    .post('/cookie')
    .set('Referer', 'http://test.invalid/login?next=/')
    .expect(204)
  await http.post('/cookie').expect(204)
  for (const value of [
    'http://evil.invalid',
    'null',
    'http://test.invalid.evil.invalid',
    'https://test.invalid',
    'http://test.invalid:8080',
  ]) {
    const rejected = await http.post('/cookie').set('Origin', value).expect(403)
    assert.equal(rejected.body.message, 'Request origin not allowed')
  }
  for (const value of ['http://evil.invalid/login', 'not a url', 'null'])
    await http.post('/cookie').set('Referer', value).expect(403)
})

test('origin guard: Origin takes precedence over Referer and safe methods are never blocked', async () => {
  const http = app()
  await http
    .post('/cookie')
    .set('Origin', 'http://evil.invalid')
    .set('Referer', 'http://test.invalid/')
    .expect(403)
  await http
    .post('/cookie')
    .set('Origin', 'http://test.invalid')
    .set('Referer', 'http://evil.invalid/')
    .expect(204)
  await http.get('/cookie').set('Origin', 'http://evil.invalid').expect(204)
})
