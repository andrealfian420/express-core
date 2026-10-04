// Purpose: BullMQ worker for the email queue.
// Caller: jobs/workers/index.ts (started by run-workers.ts in the worker process).
// Dependencies: BullMQ, shared Redis connection, email.processor, queue constants.
// Main Functions: emailWorker (default export); re-exports EmailJobData.
// Side Effects: Consumes email jobs from Redis as soon as it is imported; sends email
//   through processEmailJob.
import { Worker } from 'bullmq'
import redis from '../../config/redis'
import { QUEUE_NAMES } from '../config/queue.constants'
import { EmailJobData, processEmailJob } from './email.processor'

export type { EmailJobData }

const emailWorker = new Worker<EmailJobData>(QUEUE_NAMES.EMAIL, processEmailJob, {
  connection: redis,
  concurrency: 5, // Process up to 5 jobs concurrently
  // A slow SMTP exchange must not lose its lock; a worker that dies mid-send has its job
  // re-run once (the sent marker suppresses a duplicate if the send had completed).
  lockDuration: 60_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
})

export default emailWorker
