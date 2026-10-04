// Purpose: Worker process entrypoint — BullMQ workers, the outbox relay, the maintenance
//   scheduler (single owner of all cron schedules), a liveness file for Docker, and graceful
//   shutdown.
// Caller: `node dist/jobs/run-workers.js` (PM2 fork `worker`, Docker `worker` service), `npm run dev`.
// Dependencies: config/env (imported first), workers, worker logging, outbox relay, cron
//   schedules, email/system queues, mailer (config check), Prisma, Redis, logger,
//   utils/graceful-shutdown.
// Main Functions: none exported; module start-up and the shutdown step list.
// Side Effects: Consumes jobs, publishes outbox rows, starts cron timers, writes
//   /tmp/worker-health every 10 s; on SIGINT/SIGTERM stops schedules and the relay, finishes
//   active jobs, waits for dead-letter writes, then closes queues, Prisma and Redis.
import '../config/env' // MUST stay first: load .env and validate before any module reads config
import { writeFileSync } from 'fs'
import logger from '../config/logger'
import prisma from '../config/database'
import { closeRedis } from '../config/redis'
import workers from './workers'
import { drainDeadLetterWrites } from './workers/worker-logging'
import { emailQueue, systemQueue } from './index'
import { startOutboxRelay, stopOutboxRelay } from './relay/outbox-relay'
import startCronJobs from './cron'
import { validateMailConfig } from '../email/mailer'
import {
  createShutdown,
  installProcessHandlers,
} from '../utils/graceful-shutdown'

// Liveness probe: Docker's healthcheck requires this file to be younger than one minute.
const HEALTH_FILE = '/tmp/worker-health'

function touchHealthFile(): void {
  try {
    writeFileSync(HEALTH_FILE, Date.now().toString())
  } catch {
    // ignore write errors (e.g., read-only filesystem without tmpfs)
  }
}

touchHealthFile()
const healthInterval = setInterval(touchHealthFile, 10_000)
healthInterval.unref()

// Misconfigured mail must be visible at boot, not only when the first email dead-letters.
for (const problem of validateMailConfig()) {
  logger.error(`Mail configuration: ${problem}; email jobs will fail permanently`)
}

// The relay and the schedules only enqueue; they start after the workers that consume jobs.
startOutboxRelay()
const cronTasks = startCronJobs()

const shutdown = createShutdown({
  timeoutMs: 30_000,
  logger,
  steps: [
    {
      name: 'scheduler',
      run: () => Promise.all(cronTasks.map((task) => task.destroy())),
    },
    { name: 'outbox relay', run: stopOutboxRelay },
    { name: 'health file', run: () => clearInterval(healthInterval) },
    {
      name: 'workers',
      run: () => Promise.all(workers.map((worker) => worker.close())),
    },
    { name: 'dead-letter writes', run: drainDeadLetterWrites },
    {
      name: 'queues',
      run: () => Promise.all([emailQueue.close(), systemQueue.close()]),
    },
    { name: 'database', run: () => prisma.$disconnect() },
    { name: 'redis', run: closeRedis },
  ],
})

installProcessHandlers(shutdown, logger)

logger.info(
  `Started ${workers.length} workers and ${cronTasks.length} schedules`,
)
