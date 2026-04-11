const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const db = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const adminPassword = await bcrypt.hash('password', 12)

  let admin = await db.user.findFirst({
    where: {
      email: 'admin@admin.com',
      deletedAt: null,
    },
  })

  if (admin) {
    admin = await db.user.update({
      where: { id: admin.id },
      data: {
        name: 'Administrator',
        password: adminPassword,
        isEmailVerified: true,
      },
    })
  } else {
    admin = await db.user.create({
      data: {
        name: 'Administrator',
        email: 'admin@admin.com',
        password: adminPassword,
        isEmailVerified: true,
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
