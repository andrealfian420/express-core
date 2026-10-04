// Purpose: Protect request validation, coercion and server-owned fields across core modules.
// Caller: Node unit runner.
// Dependencies: Zod module schemas and strict assertions.
// Main Functions: Table-driven validation cases plus privilege-field stripping.
// Side Effects: None; no database, Redis or application bootstrap.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from '../../src/modules/auth/auth.validation'
import {
  createRoleSchema,
  updateRoleSchema,
} from '../../src/modules/role/role.validation'
import {
  createUserSchema,
  updateUserSchema,
} from '../../src/modules/user/user.validation'
import { updateProfileSchema } from '../../src/modules/profile/profile.validation'

const cases: [string, any, object, object][] = [
  [
    'auth register',
    registerSchema,
    { name: 'User', email: 'user@example.invalid', password: 'Password1!' },
    { name: 'U', email: 'bad', password: 'weak' },
  ],
  [
    'auth login',
    loginSchema,
    { email: 'user@example.invalid', password: 'x' },
    { email: 'user@example.invalid', password: '' },
  ],
  [
    'auth request reset',
    requestPasswordResetSchema,
    { email: 'user@example.invalid' },
    { email: 'not-an-email' },
  ],
  [
    'auth reset',
    resetPasswordSchema,
    { token: 'abc', newPassword: 'Password1!' },
    { token: '', newPassword: 'Password1!' },
  ],
  [
    'role create',
    createRoleSchema,
    { title: 'Editor', userType: 'Administrator' },
    { title: '', userType: '' },
  ],
  [
    'role update',
    updateRoleSchema,
    { description: null },
    { access: [''] },
  ],
  [
    'user create',
    createUserSchema,
    {
      name: 'User',
      email: 'user@example.invalid',
      password: 'Password1!',
      roleId: '1',
    },
    { name: 'User', email: 'bad', password: 'short', roleId: '' },
  ],
  [
    'user update',
    updateUserSchema,
    { roleId: '1', password: '' },
    { roleId: '1', password: 'weakpass' },
  ],
  [
    'profile update',
    updateProfileSchema,
    { name: 'User', password: 'Password1!' },
    { name: '', email: 'bad' },
  ],
]

for (const [name, schema, valid, invalid] of cases)
  test(`${name}: accept valid input and reject malformed input`, () => {
    assert.equal(schema.safeParse(valid).success, true)
    assert.equal(schema.safeParse(invalid).success, false)
  })

test('role create: access defaults to an empty list', () => {
  assert.deepEqual(
    createRoleSchema.parse({ title: 'Editor', userType: 'Administrator' })
      .access,
    [],
  )
})

test('profile and user: privilege and server-owned fields are stripped', () => {
  assert.deepEqual(
    updateProfileSchema.parse({ name: 'User', roleId: 99, isEmailVerified: true }),
    { name: 'User' },
  )
  assert.deepEqual(
    Object.keys(
      createUserSchema.parse({
        name: 'User',
        email: 'user@example.invalid',
        password: 'Password1!',
        roleId: '1',
        isEmailVerified: false,
        slug: 'forged',
      }),
    ).sort(),
    ['email', 'name', 'password', 'roleId'],
  )
})
