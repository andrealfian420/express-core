const { Worker } = require('bullmq')
const redis = require('../../config/redis')
const AppError = require('../../utils/appError')
const { QUEUE_NAMES } = require('../config/queue.constants')
const systemService = require('../../services/system.service')

const systemWorker = new Worker(
  QUEUE_NAMES.SYSTEM,
  async (job) => {
    switch (job.name) {
      case 'cleanupExpiredTokens':
        await systemService.cleanupExpiredTokens()
        break
      default:
        throw new AppError(`Unknown job name: ${job.name}`, 500)
    }
  },
  {
    connection: redis,
    concurrency: 10, // Process up to 10 jobs concurrently
  },
)

module.exports = systemWorker

