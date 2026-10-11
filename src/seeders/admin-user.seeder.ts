// Purpose: Seed the initial administrator account on the super-admin role, only while no active
//   account uses its email. An existing account is never modified: its password, name and
//   role stay as the administrator left them.
// Caller: src/seeders/index.ts (seed runner), integration tests.
// Dependencies: Prisma Client, bcryptjs, utils/sluggable, role.seeder (super-admin lookup).
// Main Functions: adminUserSeeder (default), ADMIN_EMAIL.
// Side Effects: INSERT into users when the account is missing.
import bcrypt from 'bcryptjs'
import { makeUniqueSlug } from '../utils/sluggable'
import { findSuperAdminRole, SUPER_ADMIN_SLUG } from './role.seeder'
import { Seeder } from './seeder.types'

export const ADMIN_EMAIL = 'admin@admin.com'
const ADMIN_NAME = 'Administrator'
// Well-known initial password: change it after the first login.
const ADMIN_PASSWORD = 'password'
const BCRYPT_ROUNDS = 12

const adminUserSeeder: Seeder = {
  name: 'admin-user',
  description: `Initial administrator account (${ADMIN_EMAIL}) on the ${SUPER_ADMIN_SLUG} role`,
  async run(db) {
    const existing = await db.user.findFirst({
      where: { email: ADMIN_EMAIL, deletedAt: null },
      select: { id: true },
    })
    if (existing) return `${ADMIN_EMAIL} already exists; left unchanged`

    const role = await findSuperAdminRole(db)
    if (!role) {
      throw new Error(`Role "${SUPER_ADMIN_SLUG}" not found; run the "role" seeder first`)
    }

    const slug = await makeUniqueSlug(ADMIN_NAME, (candidate) =>
      db.user.findFirst({ where: { slug: candidate, deletedAt: null } }),
    )
    await db.user.create({
      data: {
        name: ADMIN_NAME,
        slug,
        email: ADMIN_EMAIL,
        password: await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS),
        isEmailVerified: true,
        roleId: role.id,
      },
    })
    return `created ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD}); change it after the first login`
  },
}

export default adminUserSeeder
