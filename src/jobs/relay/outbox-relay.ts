// Purpose: Publish transactional-outbox intents to BullMQ from the worker process: claim due
//   rows (lease + SKIP LOCKED), add each as a job with jobId `outbox-<id>`, then mark it
//   PUBLISHED, schedule a retry with backoff, or dead-letter it.
// Caller: src/jobs/run-workers.ts (startOutboxRelay/stopOutboxRelay); tests (runOutboxRelayOnce,
//   processRow).
// Dependencies: outbox repository, email/system queues, config/env (OUTBOX_*), logger,
//   utils/timeout.
// Main Functions: startOutboxRelay, stopOutboxRelay, runOutboxRelayOnce, processRow,
//   retryDelaySeconds, PUBLISH_TIMEOUT_MS.
// Side Effects: Reads/updates outbox rows, adds jobs to Redis, writes dead_letter_jobs (via
//   the repository) and runs an unref'd interval timer.
// Notes: Publishing is idempotent per row: the same row always becomes the same BullMQ job id,
//   so a re-publish after a crash or an expired lease collapses onto the existing job (and the
//   email processor's sent marker covers jobs that were already completed and removed).
import { Queue } from 'bullmq'
import { Prisma } from '@prisma/client'
import { emailQueue, systemQueue } from '../index'
import { QUEUE_NAMES } from '../config/queue.constants'
import outboxRepository, {
  ClaimedOutboxRow,
  outboxJobId,
} from '../../modules/outbox/outbox.repository'
import { env } from '../../config/env'
import logger from '../../config/logger'
import { withTimeout } from '../../utils/timeout'

// Queue registry: the relay stays generic; a new queue only needs an entry here.
const QUEUES: Record<string, Queue> = {
  [QUEUE_NAMES.EMAIL]: emailQueue,
  [QUEUE_NAMES.SYSTEM]: systemQueue,
}

// While Redis is unreachable, commands wait in ioredis' offline queue; bound each publish.
export const PUBLISH_TIMEOUT_MS = 5_000

export type PublishOutcome = 'published' | 'retry' | 'failed' | 'skipped'

// Exponential backoff for transient publish failures: 10 s, 20 s, 40 s … capped at 1 h.
export function retryDelaySeconds(attempts: number): number {
  return Math.min(5 * 2 ** attempts, 3_600)
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

async function publish(queue: Queue, row: ClaimedOutboxRow): Promise<void> {
  await withTimeout(
    queue.add(row.jobName, row.payload as Prisma.JsonObject, {
      jobId: outboxJobId(row.id),
    }),
    PUBLISH_TIMEOUT_MS,
    `Publish timed out after ${PUBLISH_TIMEOUT_MS} ms`,
  )
}

export async function processRow(row: ClaimedOutboxRow): Promise<PublishOutcome> {
  const queue = QUEUES[row.queueName]
  if (!queue) {
    // Unroutable: retrying can never fix it.
    const failed = await outboxRepository.markFailed(
      row,
      `Unknown queue: ${row.queueName}`,
      row.attempts + 1,
    )
    return failed ? 'failed' : 'skipped'
  }

  try {
    await publish(queue, row)
  } catch (error) {
    const attempts = row.attempts + 1
    const reason = describe(error)
    if (attempts >= env.OUTBOX_MAX_PUBLISH_ATTEMPTS) {
      const failed = await outboxRepository.markFailed(
        row,
        `Publish failed after ${attempts} attempts: ${reason}`,
        attempts,
      )
      if (failed) {
        logger.error('Outbox row dead-lettered', { id: String(row.id), reason })
      }
      return failed ? 'failed' : 'skipped'
    }

    const retried = await outboxRepository.markRetry(
      row.id,
      reason,
      new Date(Date.now() + retryDelaySeconds(attempts) * 1000),
    )
    logger.warn('Outbox publish failed; it will be retried', {
      id: String(row.id),
      attempt: attempts,
      reason,
    })
    return retried ? 'retry' : 'skipped'
  }

  // A false result means another relay finalized the row first; the job id is the same.
  return (await outboxRepository.markPublished(row.id)) ? 'published' : 'skipped'
}

// One claim-and-publish pass. After a transient failure the rest of the batch is left
// leased (no attempt consumed) and becomes claimable again when the lease expires.
async function relayOnce(): Promise<number> {
  const rows = await outboxRepository.claimBatch(env.OUTBOX_RELAY_BATCH)
  let published = 0
  for (const row of rows) {
    const outcome = await processRow(row)
    if (outcome === 'published') published++
    if (outcome === 'retry') break
  }
  if (rows.length > 0) {
    logger.info('Outbox relay pass finished', {
      claimed: rows.length,
      published,
    })
  }
  return published
}

let timer: NodeJS.Timeout | null = null
let inFlight: Promise<number> | null = null

// Runs one pass, or joins the pass already in progress (passes never overlap).
export function runOutboxRelayOnce(): Promise<number> {
  if (!inFlight) {
    inFlight = relayOnce()
      .catch((error) => {
        logger.error('Outbox relay pass failed', { reason: describe(error) })
        return 0
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export function startOutboxRelay(): void {
  if (timer) return
  timer = setInterval(() => {
    void runOutboxRelayOnce()
  }, env.OUTBOX_RELAY_INTERVAL_MS)
  timer.unref()
  logger.info('Outbox relay started', {
    intervalMs: env.OUTBOX_RELAY_INTERVAL_MS,
    batch: env.OUTBOX_RELAY_BATCH,
  })
}

// Stop scheduling passes and wait for the pass in progress, so no publish or status update
// is cut off by the database/Redis shutdown that follows.
export async function stopOutboxRelay(): Promise<void> {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (inFlight) await inFlight
}
