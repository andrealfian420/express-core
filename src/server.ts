// Purpose: API process entrypoint — validates configuration, serves HTTP and releases every
//   resource on shutdown.
// Caller: `node dist/server.js` (PM2 cluster `api`, Docker `api` service), `npm run dev`.
// Dependencies: config/env (imported first), app, Prisma, Redis, email/system queues, logger,
//   utils/graceful-shutdown.
// Main Functions: none exported; module start-up and the shutdown step list.
// Side Effects: Opens the HTTP listener; on SIGINT/SIGTERM closes HTTP, queues, Prisma and
//   Redis in order. Never schedules cron: the worker process owns all schedules.
import './config/env' // MUST stay first: load .env and validate before any module reads config
import app from './app'
import { env } from './config/env'
import prisma from './config/database'
import { closeRedis } from './config/redis'
import logger from './config/logger'
import { emailQueue, systemQueue } from './jobs'
import {
  createShutdown,
  installProcessHandlers,
} from './utils/graceful-shutdown'

const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    logger.error('HTTP server failed to start', { error: error.message })
    shutdown('listen failure', true).then((code) => {
      process.exitCode = code
    })
    return
  }

  logger.info(`Server is running on port ${env.PORT}`)
})

const closeServer = (): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )

const shutdown = createShutdown({
  timeoutMs: 15_000,
  logger,
  steps: [
    { name: 'http server', run: closeServer },
    {
      name: 'queues',
      run: () => Promise.all([emailQueue.close(), systemQueue.close()]),
    },
    { name: 'database', run: () => prisma.$disconnect() },
    { name: 'redis', run: closeRedis },
  ],
})

installProcessHandlers(shutdown, logger)
