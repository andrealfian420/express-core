// Purpose: Release rehearsal smoke checks, one phase per call, against a deployed stack:
//   readiness, logins, refresh sessions carried across versions, RBAC with a role created
//   before the upgrade, registration and password-reset emails delivered by the worker over
//   SMTP (Mailpit), profile details and seeded templates.
// Caller: scripts/release-rehearsal.sh, inside a node container on the rehearsal network.
// Dependencies: Node 24 (fetch), API_URL, MAILPIT_URL, ORIGIN and STATE_FILE environment.
// Main Functions: PHASES (fresh, baseline, upgraded, rolledback, reupgraded), api, login,
//   refresh, mailFor, emailFlow.
// Side Effects: HTTP requests creating users, roles and sessions in the rehearsal stack;
//   Mailpit reads; reads and writes the state file shared between phases.
// Notes: The baseline and rolledback phases use only requests the older release supports.
'use strict'
const fs = require('node:fs')
const assert = require('node:assert/strict')

const API = `${process.env.API_URL}/api/v1`
const MAILPIT = process.env.MAILPIT_URL
const ORIGIN = process.env.ORIGIN
const STATE_FILE = process.env.STATE_FILE || '/state/state.json'
const ADMIN = { email: 'admin@admin.com', password: 'password' }
const PASSWORD = 'Rehearsal1!'
const USER_INDEX = 'module.master-data.user.index'

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

async function api(method, path, { token, cookie, body } = {}) {
  const headers = { Origin: ORIGIN }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookie) headers.Cookie = cookie
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(API + path, {
    method,
    headers,
    body: body && JSON.stringify(body),
    redirect: 'manual',
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  const set = res.headers.getSetCookie().find((c) => c.startsWith('refreshToken='))
  return { status: res.status, body: json, cookie: set && set.split(';')[0] }
}

async function expect(label, request, status) {
  const res = await request
  assert.equal(
    res.status,
    status,
    `${label}: expected ${status}, got ${res.status} ${JSON.stringify(res.body)}`,
  )
  console.log(`  ok  ${label}`)
  return res
}

async function login(email, password, label) {
  const res = await expect(label, api('POST', '/auth/login', { body: { email, password } }), 200)
  assert.ok(res.body.data.accessToken && res.cookie, `${label}: access token and cookie`)
  return { token: res.body.data.accessToken, cookie: res.cookie }
}

async function refresh(cookie, label) {
  const res = await expect(label, api('POST', '/auth/refresh', { cookie }), 200)
  assert.ok(res.body.data.accessToken && res.cookie, `${label}: rotated cookie`)
  return { token: res.body.data.accessToken, cookie: res.cookie }
}

// Newest message to `email` created at or after `since` whose subject matches (bounded wait).
async function mailFor(email, subject, since) {
  const deadline = Date.now() + 60_000
  for (;;) {
    const query = encodeURIComponent(`to:"${email}"`)
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${query}`)).json()
    const found = messages.find(
      (m) => subject.test(m.Subject) && new Date(m.Created).getTime() >= since,
    )
    if (found) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()
      console.log(`  ok  "${found.Subject}" delivered to ${email}`)
      return `${message.Text}\n${message.HTML}`
    }
    if (Date.now() > deadline) throw new Error(`No "${subject}" email for ${email} within 60 s`)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

function tokenIn(text) {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text)
  assert.ok(match, 'the email carries a token link')
  return match[1]
}

async function requestReset(email) {
  const since = Date.now() - 1000
  await expect(
    `request a password reset for ${email}`,
    api('POST', '/auth/request-password-reset', { body: { email } }),
    200,
  )
  return tokenIn(await mailFor(email, /reset/i, since))
}

// Registration → verification email → verify → login → reset email → reset → login.
async function emailFlow(tag) {
  const email = `${tag}-${Date.now()}@rehearsal.test`
  const since = Date.now() - 1000
  await expect(
    `register ${email}`,
    api('POST', '/auth/register', { body: { name: `Rehearsal ${tag}`, email, password: PASSWORD } }),
    201,
  )
  const verifyToken = tokenIn(await mailFor(email, /verify/i, since))
  await expect(
    'verify the email from the delivered link',
    api('GET', `/auth/verify-email?token=${verifyToken}`),
    200,
  )
  await login(email, PASSWORD, `log in as ${tag} after verification`)
  const resetToken = await requestReset(email)
  const changed = 'Changed1!'
  await expect(
    'reset the password from the delivered link',
    api('POST', '/auth/reset-password', { body: { token: resetToken, newPassword: changed } }),
    200,
  )
  return { email, password: changed, ...(await login(email, changed, `log in as ${tag} with the new password`)) }
}

const ready = () => expect('readiness', api('GET', '/health/ready'), 200)

const PHASES = {
  // Current release on an empty database, after the seeders ran.
  async fresh() {
    await ready()
    const admin = await login(ADMIN.email, ADMIN.password, 'log in as the seeded admin')
    await expect('list email templates (seeded)', api('GET', '/email-templates', admin), 200)
    const types = await expect('list role user types', api('GET', '/roles/user-types', admin), 200)
    assert.ok(types.body.data.includes('Member'))
    const user = await emailFlow('fresh')
    await expect(
      'save profile details',
      api('PUT', '/profile', {
        token: user.token,
        body: { name: 'Rehearsal Fresh', phone: '+62 812-3456-789' },
      }),
      200,
    )
    const profile = await expect('read the profile', api('GET', '/profile', user), 200)
    assert.equal(profile.body.data.profile.phone, '+628123456789')
    await refresh(user.cookie, 'refresh the session')
  },

  // Older release: fixtures the upgrade must keep working.
  async baseline() {
    await ready()
    const admin = await login(ADMIN.email, ADMIN.password, 'log in as the seeded admin')
    const role = await expect(
      'create a role whose user type is not in the new catalogue',
      api('POST', '/roles', {
        token: admin.token,
        body: { title: 'Rehearsal Editors', userType: 'Editor', access: [USER_INDEX] },
      }),
      201,
    )
    const email = 'rehearsal-user@rehearsal.test'
    await expect(
      'create a user with that role',
      api('POST', '/users', {
        token: admin.token,
        body: { name: 'Rehearsal User', email, password: PASSWORD, roleId: String(role.body.data.id) },
      }),
      201,
    )
    const user = await login(email, PASSWORD, 'log in as that user')
    await expect('read the profile (cached by the older release)', api('GET', '/profile', user), 200)
    Object.assign(state, { admin, user: { email, ...user }, roleSlug: role.body.data.slug })
  },

  // Current release on the upgraded database, after the seeders ran again.
  async upgraded() {
    await ready()
    state.admin = await refresh(state.admin.cookie, 'refresh an admin session issued before the upgrade')
    const cached = await expect(
      'read the profile cached before the upgrade',
      api('GET', '/profile', { token: state.user.token }),
      200,
    )
    for (const field of ['password', 'id', 'roleId'])
      assert.equal(field in cached.body.data, false, `profile must not return ${field}`)
    const user = await login(state.user.email, PASSWORD, 'log in as the user created before the upgrade')
    await expect('list users through the role created before the upgrade', api('GET', '/users', user), 200)
    const edited = await expect(
      'edit that role without changing its user type',
      api('PUT', `/roles/${state.roleSlug}`, {
        token: state.admin.token,
        body: { description: 'Edited after the upgrade' },
      }),
      200,
    )
    assert.equal(edited.body.data.userType, 'Editor')
    await expect(
      'list email templates (permission added by the seed rerun)',
      api('GET', '/email-templates', { token: state.admin.token }),
      200,
    )
    state.member = await emailFlow('upgraded')
  },

  // Older release again, on the database the current release migrated.
  async rolledback() {
    await ready()
    const user = await login(state.user.email, PASSWORD, 'log in as the user created before the upgrade')
    await expect('list users through that role', api('GET', '/users', user), 200)
    state.member = {
      ...state.member,
      ...(await refresh(state.member.cookie, 'refresh a session issued by the newer release')),
    }
    await login(state.member.email, state.member.password, 'log in as the user registered on the newer release')
  },

  // Current release once more, after the rollback.
  async reupgraded() {
    await ready()
    await refresh(state.member.cookie, 'refresh a session issued after the rollback')
    const admin = await login(ADMIN.email, ADMIN.password, 'log in as the seeded admin')
    await expect('list email templates', api('GET', '/email-templates', admin), 200)
    await requestReset(state.member.email)
  },
}

async function main() {
  const phase = process.argv[2]
  if (!PHASES[phase]) throw new Error(`Unknown phase "${phase}" (${Object.keys(PHASES).join(', ')})`)
  console.log(`Smoke: ${phase}`)
  await PHASES[phase]()
  save()
  console.log(`Smoke: ${phase} passed`)
}

main().catch((error) => {
  console.error(`Smoke failed: ${error.message}`)
  process.exitCode = 1
})
