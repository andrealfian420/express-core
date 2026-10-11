// Purpose: Verify the extended profile field rules: normalization, validation messages, clearing
//   with null or an empty string, and the response shape.
// Caller: Node unit runner.
// Dependencies: profile.validation, profile.fields, config/env (parseEnv for SUPPORTED_LOCALES).
// Main Functions: Field normalization/validation and response mapping cases.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import { updateProfileSchema } from '../../src/modules/profile/profile.validation'
import { toProfileResponse } from '../../src/modules/profile/profile.fields'
import { parseEnv } from '../../src/config/env'

const parse = (fields: Record<string, unknown>) =>
  updateProfileSchema.safeParse({ name: 'User', ...fields })

test('profile fields: valid values are normalized; null and empty strings clear; absent fields stay absent', () => {
  const parsed = parse({
    phone: '+62 812-3456 (789)',
    birthDate: '1990-05-01',
    gender: 'female',
    locale: 'ID',
  })
  assert.ok(parsed.success)
  assert.deepEqual(
    { phone: parsed.data.phone, birthDate: parsed.data.birthDate, gender: parsed.data.gender, locale: parsed.data.locale },
    { phone: '+628123456789', birthDate: '1990-05-01', gender: 'female', locale: 'id' },
  )
  const cleared = parse({ phone: null, birthDate: '', gender: '', locale: null })
  assert.ok(cleared.success)
  assert.deepEqual(
    [cleared.data.phone, cleared.data.birthDate, cleared.data.gender, cleared.data.locale],
    [null, null, null, null],
  )
  const untouched = parse({})
  assert.ok(untouched.success)
  assert.equal('phone' in untouched.data, false)
})

test('profile fields: malformed values are rejected per field', () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  for (const [field, value, message] of [
    ['phone', '08123456789', /international format/],
    ['phone', '+0123456789', /international format/],
    ['birthDate', '1990-13-01', /YYYY-MM-DD/],
    ['birthDate', tomorrow, /cannot be in the future/],
    ['birthDate', '1899-12-31', /1900-01-01 or later/],
    ['gender', 'unknown', /Gender must be one of/],
    ['locale', 'fr', /Locale must be one of: en, id/],
    ['locale', 'not a tag!', /Locale must be one of/],
  ] as const) {
    const result = parse({ [field]: value })
    assert.equal(result.success, false, `${field}=${value}`)
    assert.match(result.error!.issues[0].message, message, `${field}=${value}`)
    assert.deepEqual(result.error!.issues[0].path, [field])
  }
})

test('profile response: dates as YYYY-MM-DD; no row means null', () => {
  assert.equal(toProfileResponse(null), null)
  assert.deepEqual(
    toProfileResponse({ phone: null, birthDate: new Date('1990-05-01T00:00:00Z'), gender: 'other', locale: 'en' }),
    { phone: null, birthDate: '1990-05-01', gender: 'other', locale: 'en' },
  )
})

test('env: SUPPORTED_LOCALES defaults to en,id and stores canonical tags', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
    JWT_ACCESS_SECRET: 'a-development-secret',
    APP_URL: 'http://localhost:3001',
    PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
  }
  assert.deepEqual(parseEnv(base).SUPPORTED_LOCALES, ['en', 'id'])
  assert.deepEqual(parseEnv({ ...base, SUPPORTED_LOCALES: 'en-us, ID ,en-US' }).SUPPORTED_LOCALES, ['en-US', 'id'])
  assert.throws(() => parseEnv({ ...base, SUPPORTED_LOCALES: 'en,not a tag!' }), /SUPPORTED_LOCALES: /)
})
