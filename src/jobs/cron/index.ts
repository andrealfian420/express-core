import cron from 'node-cron'
import systemQueue from '../queues/system.queue'
import logger from '../../config/logger'

// This function sets up scheduled cron jobs for the application
function startCronJobs(): void {
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

export default startCronJobs
