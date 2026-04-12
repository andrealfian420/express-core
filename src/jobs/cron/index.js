const cron = require('node-cron')
const systemQueue = require('../queues/system.queue')
const logger = require('../../config/logger')

// This function sets up scheduled cron jobs for the application
function startCronJobs() {
  // Schedule the cleanup job to run every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running scheduled job: Cleanup expired tokens') // Log when the cron job starts

    // Add a job to the system queue to clean up expired tokens
    await systemQueue.add('cleanupExpiredTokens', {
      removeOnComplete: true, // Automatically remove job from queue when completed
      removeOnFail: true, // Automatically remove job from queue if it fails
    })
  })
}

module.exports = startCronJobs
