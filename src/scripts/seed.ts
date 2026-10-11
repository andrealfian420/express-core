// Purpose: Seed runner: runs every registered seeder in order, or only the named ones (still in
//   registry order). Unknown names fail before anything runs.
// Caller: prisma/seed.js (`npx prisma db seed`, `npm run seed`, `make seed`,
//   `make seeder name=<name>`); integration tests run the compiled file directly.
// Dependencies: Prisma Client (plain client, DATABASE_URL only), seeder registry.
// Main Functions: run, usage.
// Side Effects: Database writes through the seeders; console output; exit code 0 on success,
//   1 for unknown names or a failing seeder (later seeders are then skipped).
import { PrismaClient } from '@prisma/client'
import { SEEDERS } from '../seeders'

export function usage(): string {
  return [
    'Usage: node prisma/seed.js [seeder ...]   (no names: run every seeder)',
    'Available seeders:',
    ...SEEDERS.map((seeder) => `  ${seeder.name.padEnd(12)} ${seeder.description}`),
  ].join('\n')
}

export async function run(argv: string[], db?: PrismaClient): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return 0
  }

  const known = new Set(SEEDERS.map((seeder) => seeder.name))
  const unknown = argv.filter((name) => !known.has(name))
  if (unknown.length > 0) {
    console.error(`Unknown seeder(s): ${unknown.join(', ')}`)
    console.error(usage())
    return 1
  }

  const selected = argv.length
    ? SEEDERS.filter((seeder) => argv.includes(seeder.name))
    : SEEDERS
  const client = db ?? new PrismaClient()
  try {
    for (const seeder of selected) {
      try {
        console.log(`[seed] ${seeder.name}: ${await seeder.run(client)}`)
      } catch (error) {
        console.error(
          `[seed] ${seeder.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        return 1
      }
    }
    return 0
  } finally {
    if (!db) await client.$disconnect()
  }
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error('Seeding failed:', error)
      process.exitCode = 1
    })
}
