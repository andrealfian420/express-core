// Purpose: Contract shared by the named database seeders and their runner.
// Caller: src/seeders/*.seeder.ts, src/seeders/index.ts, src/scripts/seed.ts.
// Dependencies: Prisma Client type.
// Main Functions: Seeder.
// Side Effects: None (type declarations only).
import { PrismaClient } from '@prisma/client'

export interface Seeder {
  // Name accepted by the runner (`node prisma/seed.js <name>`).
  name: string
  description: string
  // Must be idempotent and must not overwrite data an administrator may have edited.
  // Returns a one-line summary for the runner's output.
  run(db: PrismaClient): Promise<string>
}
