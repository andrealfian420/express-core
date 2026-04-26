const { PrismaClient } = require('@prisma/client')
const { createSoftDeleteExtension } = require('prisma-extension-soft-delete')

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ['error', 'warn'],
  }).$extends(
    createSoftDeleteExtension({
      models: {
        // enable soft delete for the these models
        User: true,
        Role: true,
      },
      defaultConfig: {
        field: 'deletedAt',
        createValue: (deleted: boolean) => {
          if (deleted) {
            return new Date()
          }

          return null
        },
      },
    }),
  )
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
}

export default prisma
