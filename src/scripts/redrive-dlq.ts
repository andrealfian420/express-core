// Purpose: Operator CLI that re-drives one dead-lettered job through the outbox, once.
// Caller: `npm run dlq:redrive -- <id> [--by <name>]`, `make redrive id=<id> by=<name>`, or
//   `node dist/scripts/redrive-dlq.js <id> [--by <name>]` inside the worker container.
// Dependencies: config/env (validated configuration), dead-letter.service, Prisma.
// Main Functions: run (argument parsing and exit code), module start-up.
// Side Effects: Inserts one outbox row and stamps the dead-letter row (see
//   dead-letter.service); prints the result; exits 1 on refusal or invalid input.
import '../config/env' // MUST stay first: load .env and validate before any module reads config
import prisma from '../config/database'
import deadLetterService, {
  RedriveError,
} from '../modules/dead-letter/dead-letter.service'

const USAGE = 'Usage: node dist/scripts/redrive-dlq.js <deadLetterJobId> [--by <operator>]'

export async function run(argv: string[]): Promise<number> {
  const [id, ...rest] = argv
  const byIndex = rest.indexOf('--by')
  const by = byIndex >= 0 ? rest[byIndex + 1] : undefined

  if (!id || !/^\d+$/.test(id) || (byIndex >= 0 && !by)) {
    console.error(USAGE)
    return 1
  }

  try {
    const result = await deadLetterService.redrive(BigInt(id), by ?? null)
    console.log(
      `Re-drove dead-letter job ${result.deadLetterId} (${result.queueName}:${result.jobName}) as outbox row ${result.outboxId}; the worker relay publishes it shortly.`,
    )
    return 0
  } catch (error) {
    if (error instanceof RedriveError) {
      console.error(error.message)
      return 1
    }
    throw error
  }
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error('Re-drive failed:', error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
