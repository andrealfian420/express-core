const { PrismaClient } = require('@prisma/client')
const { createSoftDeleteExtension } = require('prisma-extension-soft-delete')

const globalForPrisma = global

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  })

const prisma =
  globalForPrisma.extendedPrisma ||
  basePrisma.$extends(
    createSoftDeleteExtension({
      models: {
        // enable soft delete for the these models
        User: true,
        Role: true,
      },
      defaultConfig: {
        field: 'deletedAt',
        createValue: (deleted) => {
          if (deleted) return new Date()
          return null
        },
      },
    }),
  )

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma
  globalForPrisma.extendedPrisma = prisma
}

module.exports = prisma
