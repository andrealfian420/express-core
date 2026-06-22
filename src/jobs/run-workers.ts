// Start All Workers
import { writeFileSync } from 'fs'
import logger from '../config/logger'
import workers from './workers'

// Liveness probe: periodically write timestamp to /tmp/worker-health
// Docker healthcheck can verify this file is recent
const HEALTH_FILE = '/tmp/worker-health'
const healthInterval = setInterval(() => {
  try {
    writeFileSync(HEALTH_FILE, Date.now().toString())
  } catch {
    // ignore write errors (e.g., read-only filesystem without tmpfs)
  }
}, 10_000)
healthInterval.unref()

// Write initial health file
try {
  writeFileSync(HEALTH_FILE, Date.now().toString())
} catch {
  // ignore
}

// Graceful shutdown for workers
let isShuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info(`Received ${signal}. Shutting down workers...`)

  // Force-kill fallback
  const forceExitTimeout = setTimeout(() => {
    logger.error('Worker shutdown timed out, forcing exit')
    process.exit(1)
  }, 30_000)
  forceExitTimeout.unref()

  clearInterval(healthInterval)

  for (const worker of workers) {
    await worker.close()
  }

  logger.info('Workers shut down successfully')
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

logger.info(`Started ${workers.length} workers`)
logger.info('Workers started successfully')
