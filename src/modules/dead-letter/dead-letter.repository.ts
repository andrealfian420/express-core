// Purpose: Data access for the dead-letter store (dead_letter_jobs): record jobs that failed
//   permanently in a worker and prune old rows.
// Caller: jobs/workers/worker-logging.ts (record), system.service (prune), dead-letter.service.
// Dependencies: Prisma client.
// Main Functions: record, prune, DeadLetterRecord.
// Side Effects: INSERT into dead_letter_jobs; bounded batched DELETE during retention.
import { Prisma } from '@prisma/client'
import prisma from '../../config/database'

export interface DeadLetterRecord {
  queueName: string
  jobName: string
  jobId?: string | null
  payload: Prisma.InputJsonValue
  failedReason: string
  attemptsMade: number
}

class DeadLetterRepository {
  async record(data: DeadLetterRecord): Promise<void> {
    await prisma.deadLetterJob.create({
      data: { ...data, jobId: data.jobId ?? null },
    })
  }

  // Retention: delete rows created before `before`, oldest first, in short batches on the
  // created_at index. Returns rows removed.
  async prune(before: Date, batchSize = 1_000, maxBatches = 100): Promise<number> {
    let removed = 0
    for (let batch = 0; batch < maxBatches; batch++) {
      // Same stable plan as outbox retention: index-driven batch, then primary-key lookups.
      const deleted = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "dead_letter_jobs"
        WHERE "id" = ANY(ARRAY(
          SELECT "id" FROM "dead_letter_jobs"
          WHERE "created_at" < ${before}
          ORDER BY "created_at"
          LIMIT ${batchSize}
        ))
      `)
      removed += deleted
      if (deleted < batchSize) break
    }
    return removed
  }
}

export default new DeadLetterRepository()
