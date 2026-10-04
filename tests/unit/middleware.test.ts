// Purpose: Verify bearer authentication, request validation and error contracts in isolation.
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
import validate from '../../src/middleware/validate.middleware'
import errors from '../../src/middleware/error.middleware'
import AppError from '../../src/utils/appError'
import { loginSchema } from '../../src/modules/auth/auth.validation'

function app() {
  const app = express()
  app.use(express.json())
  app.get('/protected', auth, (req, res) => res.json(req.user))
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
