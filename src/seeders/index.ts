// Purpose: Registry of the named database seeders, in run order; its names are the only ones
//   the seed runner accepts.
// Caller: src/scripts/seed.ts.
// Dependencies: role, admin-user and email-template seeders.
// Main Functions: SEEDERS.
// Side Effects: None.
// Notes: A module that ships seed data adds its seeder here, after the seeders it depends on.
import { Seeder } from './seeder.types'
import roleSeeder from './role.seeder'
import adminUserSeeder from './admin-user.seeder'
import emailTemplateSeeder from './email-template.seeder'

export const SEEDERS: readonly Seeder[] = [roleSeeder, adminUserSeeder, emailTemplateSeeder]
