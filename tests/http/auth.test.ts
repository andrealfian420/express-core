// Purpose: Verify the browser-facing auth contract over HTTP: CORS rejection status, the
//   Origin/Referer guard on cookie endpoints, Bearer-only protected routes, cookie attributes
//   and the client-safe registration response.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, actor fixtures, Prisma.
// Main Functions: CORS, origin-guard matrix, refresh/logout rejection, Bearer/cookie and
//   registration response cases.
// Side Effects: Writes isolated identity and refresh-token rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, actor, db, password } from '../support/integration'
import { api } from '../support/http'

setupIntegration()

const allowed = 'http://test.invalid'
const foreign = 'http://evil.invalid'

test('cors: disallowed and null origins get 403 on any route; allowed origins get credentialed CORS headers', async () => {
  const ok = await api('get', '/health').set('Origin', allowed).expect(200)
  assert.equal(ok.headers['access-control-allow-origin'], allowed)
  assert.equal(ok.headers['access-control-allow-credentials'], 'true')
  // Regression: a rejected origin used to fall through to the error handler as a 500.
  for (const origin of [foreign, 'null', `${allowed}.evil.invalid`]) {
    const rejected = await api('get', '/health').set('Origin', origin).expect(403)
    assert.deepEqual(rejected.body, {
      success: false,
      message: 'Not allowed by CORS',
    })
  }
  await api('get', '/health').expect(200)
})

test('login: allowed Origin, allowed Referer or no browser headers succeed; foreign, null and malformed Referer are rejected', async () => {
  const { user } = await actor()
  const credentials = { email: user.email, password }
  await api('post', '/auth/login').set('Origin', allowed).send(credentials).expect(200)
  await api('post', '/auth/login')
    .set('Referer', `${allowed}/login?next=/`)
    .send(credentials)
    .expect(200)
  await api('post', '/auth/login').send(credentials).expect(200)
  for (const referer of [`${foreign}/login`, 'not a url', 'null']) {
    const rejected = await api('post', '/auth/login')
      .set('Referer', referer)
      .send(credentials)
      .expect(403)
    assert.equal(rejected.body.message, 'Request origin not allowed')
  }
  await api('post', '/auth/login')
    .set('Origin', foreign)
    .set('Referer', `${allowed}/login`)
    .send(credentials)
    .expect(403)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 3)
})

test('refresh/logout: a foreign Referer is rejected before the refresh token is rotated or revoked', async () => {
  const { user } = await actor()
  const login = await api('post', '/auth/login')
    .send({ email: user.email, password })
    .expect(200)
  const cookie = login.headers['set-cookie']
  const before = await db.refreshToken.findFirstOrThrow({ where: { userId: user.id } })
  await api('post', '/auth/refresh')
    .set('Cookie', cookie)
    .set('Referer', `${foreign}/`)
    .expect(403)
  await api('post', '/auth/logout')
    .set('Cookie', cookie)
    .set('Referer', `${foreign}/`)
    .expect(403)
  const after = await db.refreshToken.findFirstOrThrow({ where: { userId: user.id } })
  assert.equal(after.id, before.id)
  const refreshed = await api('post', '/auth/refresh')
    .set('Cookie', cookie)
    .set('Origin', allowed)
    .expect(200)
  await api('post', '/auth/logout')
    .set('Cookie', refreshed.headers['set-cookie'])
    .set('Referer', `${allowed}/settings`)
    .expect(200)
  assert.equal(await db.refreshToken.count({ where: { userId: user.id } }), 0)
})

test('bearer/cookie: protected routes accept only Bearer, refresh accepts only the cookie, cookie attributes hold', async () => {
  const { user, token } = await actor()
  const login = await api('post', '/auth/login')
    .send({ email: user.email, password })
    .expect(200)
  const cookie = String(login.headers['set-cookie'])
  assert.match(cookie, /refreshToken=[0-9a-f]{128};/)
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assert.match(cookie, /Path=\//)
  assert.doesNotMatch(cookie, /Secure/i)
  assert.equal(typeof login.body.data.accessToken, 'string')
  assert.equal(Object.keys(login.body.data).join(), 'accessToken')
  await api('get', '/profile')
    .set('Cookie', login.headers['set-cookie'])
    .expect(401)
  await api('post', '/auth/refresh', token).expect(401)
  // The guard is scoped to cookie endpoints: Bearer writes are unaffected by a foreign Referer.
  await api('put', '/profile', token)
    .set('Referer', `${foreign}/`)
    .send({ name: 'Bearer Only' })
    .expect(200)
})

test('register: public endpoint is not origin-guarded and returns only client-safe user fields', async () => {
  const response = await api('post', '/auth/register')
    .set('Referer', `${foreign}/signup`)
    .send({ name: 'New User', email: 'new@example.invalid', password })
    .expect(201)
  const user = response.body.data.user
  assert.deepEqual(Object.keys(response.body.data), ['user'])
  assert.deepEqual(Object.keys(user).sort(), [
    'avatar',
    'createdAt',
    'email',
    'isEmailVerified',
    'name',
    'slug',
    'updatedAt',
  ])
  assert.equal(user.isEmailVerified, false)
})
