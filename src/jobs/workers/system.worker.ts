// Purpose: BullMQ worker for the system (maintenance) queue.
// Caller: jobs/workers/index.ts (started by run-workers.ts in the worker process).
// Dependencies: BullMQ, shared Redis connection, system.processor, queue constants.
// Main Functions: systemWorker (default export).
// Side Effects: Consumes system jobs from Redis as soon as it is imported.
import { Worker } from 'bullmq'
import redis from '../../config/redis'
import { QUEUE_NAMES } from '../config/queue.constants'
import { processSystemJob } from './system.processor'

const systemWorker = new Worker(QUEUE_NAMES.SYSTEM, processSystemJob, {
  connection: redis,
  concurrency: 10, // Process up to 10 jobs concurrently
})

export default systemWorker
