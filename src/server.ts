import app from './app'
import startCronJobs from './jobs/cron'
import prisma from './config/database'
import redis from './config/redis'
import logger from './config/logger'

startCronJobs()
const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})

// Graceful shutdown
// This function will be called when the process receives a termination signal (e.g., SIGINT, SIGTERM)
// It will attempt to close the server and release resources like database connections before exiting
let isShuttingDown = false

async function gracefulShutdown(signal?: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info(`Shutting down gracefully... ${signal ? `(${signal})` : ''}`)

  // Force-kill fallback if graceful shutdown hangs
  const forceExitTimeout = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit')
    process.exit(1)
  }, 15_000)
  forceExitTimeout.unref()

  server.close(async () => {
    try {
      await prisma.$disconnect()
      await redis.quit()
      logger.info('Resources released successfully')

      process.exit(0)
    } catch (error) {
      logger.error('Error during shutdown', { error })

      process.exit(1)
    }
  })
}

// Listen for termination signals to trigger graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { error })
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', { reason, promise })
  gracefulShutdown('unhandledRejection')
})
