const app = require('./app')
const startCronJobs = require('./jobs/cron')
const prisma = require('./config/database')
const redis = require('./config/redis')
const logger = require('./config/logger')

startCronJobs()
const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})

// Graceful shutdown
// This function will be called when the process receives a termination signal (e.g., SIGINT, SIGTERM)
// It will attempt to close the server and release resources like database connections before exiting
async function gracefulShutdown() {
  logger.info('Shutting down gracefully...')

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
process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error })
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { reason, promise })

  process.exit(1)
})
