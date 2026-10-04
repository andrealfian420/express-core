// Purpose: Lifecycle logging for BullMQ workers and dead-lettering of final job failures.
// Caller: jobs/workers/index.ts (every worker); run-workers.ts (drain on shutdown); tests.
// Dependencies: BullMQ Worker/UnrecoverableError, logger, dead-letter repository.
// Main Functions: attachWorkerLogging, drainDeadLetterWrites, isFinalFailure.
// Side Effects: Writes log entries (never job payloads, which can hold tokens) and INSERTs
//   a dead_letter_jobs row when a job fails for the last time (retries exhausted or an
//   unrecoverable error). Writes are tracked so shutdown can wait for them.
import { Job, UnrecoverableError, Worker } from 'bullmq'
import { Prisma } from '@prisma/client'
import logger from '../../config/logger'
import deadLetterRepository from '../../modules/dead-letter/dead-letter.repository'

const pendingWrites = new Set<Promise<void>>()

// Final when no retry will follow: an unrecoverable error, or the last allowed attempt.
export function isFinalFailure(job: Job, error: Error): boolean {
  const unrecoverable =
    error instanceof UnrecoverableError || error.name === 'UnrecoverableError'
  return unrecoverable || job.attemptsMade >= (job.opts?.attempts ?? 1)
}

function recordDeadLetter(worker: Worker, job: Job, error: Error): void {
  const write: Promise<void> = deadLetterRepository
    .record({
      queueName: worker.name,
      jobName: job.name,
      jobId: job.id ?? null,
      payload: (job.data ?? {}) as Prisma.InputJsonValue,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
    })
    .catch((dlqError: unknown) => {
      // Never let a dead-letter failure crash the worker loop; the job stays failed in Redis.
      logger.error('Failed to record a dead-letter job', {
        queue: worker.name,
        job: job.name,
        jobId: job.id,
        reason: dlqError instanceof Error ? dlqError.message : String(dlqError),
      })
    })
    .then(() => {
      pendingWrites.delete(write)
    })
  pendingWrites.add(write)
}

export function attachWorkerLogging(worker: Worker): void {
  worker.on('completed', (job) => {
    logger.info('Job completed', {
      queue: worker.name,
      job: job.name,
      jobId: job.id,
    })
  })

  worker.on('failed', (job, error) => {
    if (!job) {
      logger.error('Job failed without job context', {
        queue: worker.name,
        reason: error.message,
      })
      return
    }

    const context = {
      queue: worker.name,
      job: job.name,
      jobId: job.id,
      attempt: job.attemptsMade,
      maxAttempts: job.opts?.attempts ?? 1,
      reason: error.message,
    }

    if (isFinalFailure(job, error)) {
      logger.error('Job failed permanently; recording dead letter', context)
      recordDeadLetter(worker, job, error)
    } else {
      logger.warn('Job attempt failed; it will be retried', context)
    }
  })

  worker.on('error', (error) => {
    logger.error('Worker error', { queue: worker.name, reason: error.message })
  })
}

// Wait for dead-letter writes started by `failed` events (call after closing the workers
// and before disconnecting the database).
export async function drainDeadLetterWrites(): Promise<void> {
  await Promise.allSettled([...pendingWrites])
}
