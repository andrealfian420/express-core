// Purpose: Process system maintenance jobs (token cleanup, outbox and dead-letter retention)
//   without starting a BullMQ worker.
// Caller: system.worker.ts (BullMQ worker); integration tests.
// Dependencies: system.service, BullMQ UnrecoverableError, queue constants.
// Main Functions: processSystemJob.
// Side Effects: Deletes expired tokens and old outbox/dead-letter rows through system.service.
import { Job, UnrecoverableError } from 'bullmq'
import systemService from '../../services/system.service'
import { SYSTEM_JOBS } from '../config/queue.constants'

export async function processSystemJob(job: Job): Promise<void> {
  switch (job.name) {
    case SYSTEM_JOBS.CLEANUP_EXPIRED_TOKENS:
      await systemService.cleanupExpiredTokens()
      break
    case SYSTEM_JOBS.CLEANUP_OUTBOX:
      await systemService.cleanupOutbox()
      break
    case SYSTEM_JOBS.CLEANUP_DEAD_LETTER_JOBS:
      await systemService.cleanupDeadLetterJobs()
      break
    default:
      // Retrying can never teach the processor a new job name.
      throw new UnrecoverableError(`Unknown job name: ${job.name}`)
  }
}
