// Start All Workers
const logger = require('../config/logger')
const workers = require('./workers')

// Graceful shutdown for workers
async function shutdown(signal) {
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
