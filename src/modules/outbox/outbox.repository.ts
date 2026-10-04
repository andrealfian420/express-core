// Purpose: Data access for the transactional outbox: write enqueue intents inside the
//   caller's transaction, lease due rows to the relay, finalize them and prune old ones.
// Caller: Producers (auth.service) call enqueue() inside their transaction; the outbox
//   relay (jobs/relay/outbox-relay.ts) and system.service use the rest.
// Dependencies: Prisma client and transaction client, outbox and dead_letter_jobs tables.
// Main Functions: enqueue, claimBatch, markPublished, markRetry, markFailed, prune,
//   outboxJobId, ClaimedOutboxRow.
// Side Effects: INSERT/UPDATE/DELETE on outbox; markFailed also INSERTs into
//   dead_letter_jobs in the same transaction.
// Notes: claimBatch leases rows with UPDATE … FOR UPDATE SKIP LOCKED and returns at once, so
//   no row lock is held while the relay talks to Redis; a relay that dies mid-publish only
//   delays its rows until the lease expires. All finalizing updates are guarded by
//   status = 'PENDING', so a late or concurrent relay can never undo a terminal state.
//   Timestamps compare against the database clock (now()); like Prisma's defaults this
//   assumes the database session time zone is UTC.
import { Prisma } from '@prisma/client'
import prisma from '../../config/database'
import { env } from '../../config/env'
import { PrismaTx } from '../../types/prisma'

export interface ClaimedOutboxRow {
  id: bigint
  queueName: string
  jobName: string
  payload: Prisma.JsonValue
  attempts: number
}

export type TerminalStatus = 'PUBLISHED' | 'FAILED'

// BullMQ rejects purely numeric custom ids, and one intent must always map to one job id.
export function outboxJobId(id: bigint): string {
  return `outbox-${id}`
}

class OutboxRepository {
  // Record an intent INSIDE the caller's transaction; a rollback removes it with the
  // business change, and nothing touches Redis on the request path.
  async enqueue(
    tx: PrismaTx,
    queueName: string,
    jobName: string,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.outbox.create({ data: { queueName, jobName, payload } })
  }

  // Lease up to `limit` due PENDING rows, oldest available first. The range scan on
  // (status, available_at) stops after `limit` rows; SKIP LOCKED keeps concurrent relays
  // on disjoint rows; pushing available_at forward is the lease.
  async claimBatch(limit: number): Promise<ClaimedOutboxRow[]> {
    const rows = await prisma.$queryRaw(Prisma.sql`
      UPDATE "outbox"
      SET "available_at" = now() + make_interval(secs => ${env.OUTBOX_LEASE_SECONDS}),
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id" FROM "outbox"
        WHERE "status" = 'PENDING' AND "available_at" <= now()
        ORDER BY "available_at"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id",
                "queue_name" AS "queueName",
                "job_name"   AS "jobName",
                "payload",
                "attempts"
    `)
    return rows as ClaimedOutboxRow[]
  }

  // Published: the BullMQ job now carries the payload, so the copy here is cleared
  // (tokens do not linger in the outbox). available_at records the terminal time.
  async markPublished(id: bigint): Promise<boolean> {
    const now = new Date()
    const { count } = await prisma.outbox.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        availableAt: now,
        payload: {},
        lastError: null,
      },
    })
    return count === 1
  }

  // Transient publish failure: count the attempt and defer the row until availableAt.
  async markRetry(
    id: bigint,
    error: string,
    availableAt: Date,
  ): Promise<boolean> {
    const { count } = await prisma.outbox.updateMany({
      where: { id, status: 'PENDING' },
      data: { attempts: { increment: 1 }, lastError: error, availableAt },
    })
    return count === 1
  }

  // Permanent publish failure: mark FAILED and copy to the dead-letter store atomically,
  // so a crash can never leave a FAILED row without its dead-letter record (or vice versa).
  async markFailed(
    row: ClaimedOutboxRow,
    reason: string,
    attempts: number,
  ): Promise<boolean> {
    return await prisma.$transaction(async (tx: PrismaTx) => {
      const { count } = await tx.outbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          attempts,
          lastError: reason,
          availableAt: new Date(),
        },
      })
      if (count === 0) return false

      await tx.deadLetterJob.create({
        data: {
          queueName: row.queueName,
          jobName: row.jobName,
          jobId: outboxJobId(row.id),
          payload: (row.payload ?? {}) as Prisma.InputJsonValue,
          failedReason: reason,
          attemptsMade: attempts,
        },
      })
      return true
    })
  }

  // Retention: delete terminal rows whose terminal time (available_at) is older than
  // `before`, in short bounded batches that reuse the claim index. Returns rows removed.
  async prune(
    status: TerminalStatus,
    before: Date,
    batchSize = 1_000,
    maxBatches = 100,
  ): Promise<number> {
    let removed = 0
    for (let batch = 0; batch < maxBatches; batch++) {
      // id = ANY(ARRAY(...)) keeps one stable plan at any table size: the batch comes from
      // the (status, available_at) index, then primary-key lookups. `id IN (subquery)` can
      // flip to a hash join over a full-table scan depending on statistics.
      const deleted = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "outbox"
        WHERE "id" = ANY(ARRAY(
          SELECT "id" FROM "outbox"
          WHERE "status" = ${status}::"OutboxStatus" AND "available_at" < ${before}
          ORDER BY "available_at"
          LIMIT ${batchSize}
        ))
      `)
      removed += deleted
      if (deleted < batchSize) break
    }
    return removed
  }
}

export default new OutboxRepository()
