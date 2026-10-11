// Purpose: Seed entrypoint for `npx prisma db seed`, `npm run seed`, `make seed` and
//   `make seeder name=<name>`: runs every seeder, or only the names given as arguments.
// Caller: package.json (`prisma.seed`, `seed` script), Makefile.
// Dependencies: The compiled runner dist/scripts/seed.js (build first with `npx tsc`); seeders
//   live in src/seeders/.
// Main Functions: None; delegates to run().
// Side Effects: Database writes by the seeders; sets the process exit code.
const { run } = require('../dist/scripts/seed')

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error('Seeding failed:', error)
    process.exitCode = 1
  })
