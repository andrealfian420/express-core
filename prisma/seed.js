const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const { ALL_PERMISSIONS } = require('../src/modules/role/role.permissions')
const { makeUniqueSlug } = require('../src/utils/sluggable')
const db = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── 1. Roles ──────────────────────────────────────────────────────────────

  // Super Admin: every permission granted
  let superAdminRole = await db.role.findFirst({
    where: { slug: 'super-admin', deletedAt: null },
  })

  if (superAdminRole) {
    superAdminRole = await db.role.update({
      where: { id: superAdminRole.id },
      data: {
        title: 'Super Administrator',
        userType: 'Administrator',
        description: 'Full access to all modules',
        access: ALL_PERMISSIONS,
      },
    })
  } else {
    superAdminRole = await db.role.create({
      data: {
        slug: 'super-admin',
        title: 'Super Administrator',
        userType: 'Administrator',
        description: 'Full access to all modules',
        access: ALL_PERMISSIONS,
      },
    })
  }

  console.log(`Role seeded: ${superAdminRole.slug} (id: ${superAdminRole.id})`)

  // ── 2. Admin user ─────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash('password', 12)
  const adminName = 'Administrator'

  let admin = await db.user.findFirst({
    where: { email: 'admin@admin.com', deletedAt: null },
  })

  if (admin) {
    // onUpdate: regenerate slug if name changed
    let slug = admin.slug
    if (!slug || admin.name !== adminName) {
      slug = await makeUniqueSlug(
        adminName,
        (candidate, excludeId) =>
          db.user.findFirst({
            where: { slug: candidate, deletedAt: null, id: { not: excludeId } },
          }),
        admin.id,
      )
    }

    admin = await db.user.update({
      where: { id: admin.id },
      data: {
        name: adminName,
        slug,
        password: adminPassword,
        isEmailVerified: true,
        roleId: superAdminRole.id,
      },
    })
  } else {
    const slug = await makeUniqueSlug(adminName, (candidate) =>
      db.user.findFirst({ where: { slug: candidate, deletedAt: null } }),
    )

    admin = await db.user.create({
      data: {
        name: adminName,
        slug,
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
