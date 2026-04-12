const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const { ALL_PERMISSIONS } = require('../src/modules/role/role.permissions')
const db = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── 1. Roles ──────────────────────────────────────────────────────────────

  // Super Admin: every permission granted
  const superAdminRole = await db.role.upsert({
    where: { slug: 'super-admin' },
    update: {
      title: 'Super Administrator',
      userType: 'super_admin',
      description: 'Full access to all modules',
      access: ALL_PERMISSIONS,
    },
    create: {
      slug: 'super-admin',
      title: 'Super Administrator',
      userType: 'super_admin',
      description: 'Full access to all modules',
      access: ALL_PERMISSIONS,
    },
  })

  console.log(`Role seeded: ${superAdminRole.slug} (id: ${superAdminRole.id})`)

  // ── 2. Admin user ─────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash('password', 12)

  let admin = await db.user.findFirst({
    where: { email: 'admin@admin.com', deletedAt: null },
  })

  if (admin) {
    admin = await db.user.update({
      where: { id: admin.id },
      data: {
        name: 'Administrator',
        password: adminPassword,
        isEmailVerified: true,
        roleId: superAdminRole.id,
      },
    })
  } else {
    admin = await db.user.create({
      data: {
        name: 'Administrator',
        email: 'admin@admin.com',
        password: adminPassword,
        isEmailVerified: true,
        roleId: superAdminRole.id,
      },
    })
  }

  console.log(`Admin user seeded: ${admin.email} (id: ${admin.id})`)
  console.log('Password: password')
}

main()
  .catch((err) => {
    console.error('Seeding Failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
