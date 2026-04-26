// Start All Workers
import logger from '../config/logger'
import workers from './workers'

// Graceful shutdown for workers
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}. Shutting down workers...`)

  for (const worker of workers) {
    await worker.close()
  }

  logger.info('Workers shut down successfully')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

logger.info(`Started ${workers.length} workers`)
logger.info('Workers started successfully')
