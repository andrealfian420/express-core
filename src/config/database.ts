// Purpose: Provide the shared Prisma client with the soft-delete extension (User, Role).
// Caller: Repositories, services, middleware, health checks and shutdown handlers.
// Dependencies: @prisma/client, prisma-extension-soft-delete, config/env (NODE_ENV).
// Main Functions: prisma (default export).
// Side Effects: Opens database connections lazily; reuses one client per process outside production.
import { env } from './env'
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

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
}

export default prisma
