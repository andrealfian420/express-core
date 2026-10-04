// Purpose: Worker process entrypoint — BullMQ workers, the maintenance scheduler (single
//   owner of all cron schedules), a liveness file for Docker, and graceful shutdown.
// Caller: `node dist/jobs/run-workers.js` (PM2 fork `worker`, Docker `worker` service), `npm run dev`.
// Dependencies: config/env (imported first), workers, cron schedules, system queue, Prisma,
//   Redis, logger, utils/graceful-shutdown.
// Main Functions: none exported; module start-up and the shutdown step list.
// Side Effects: Consumes jobs, starts cron timers, writes /tmp/worker-health every 10 s; on
//   SIGINT/SIGTERM stops schedules, finishes active jobs and closes queues, Prisma and Redis.
import '../config/env' // MUST stay first: load .env and validate before any module reads config
import { writeFileSync } from 'fs'
import logger from '../config/logger'
import prisma from '../config/database'
import { closeRedis } from '../config/redis'
import workers from './workers'
import systemQueue from './queues/system.queue'
import startCronJobs from './cron'
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

// Schedules only enqueue; they start after the workers that consume their jobs.
const cronTasks = startCronJobs()

const shutdown = createShutdown({
  timeoutMs: 30_000,
  logger,
  steps: [
    {
      name: 'scheduler',
      run: () => Promise.all(cronTasks.map((task) => task.destroy())),
    },
    { name: 'health file', run: () => clearInterval(healthInterval) },
    {
      name: 'workers',
      run: () => Promise.all(workers.map((worker) => worker.close())),
    },
    { name: 'queues', run: () => systemQueue.close() },
    { name: 'database', run: () => prisma.$disconnect() },
    { name: 'redis', run: closeRedis },
  ],
})

installProcessHandlers(shutdown, logger)

logger.info(
  `Started ${workers.length} workers and ${cronTasks.length} schedules`,
)
