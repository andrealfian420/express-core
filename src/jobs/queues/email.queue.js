const { Queue } = require('bullmq')
const redis = require('../../config/redis')
const DEFAULT_JOB_OPTIONS = {
  attempts: 3, // Retry up to 3 times on failure
  backoff: {
    type: 'exponential', // Use exponential backoff for retries
    delay: 5000, // Initial delay of 5 seconds before retrying
  },
  removeOnComplete: 100, // Keep the last 100 completed jobs
  removeOnFail: 500, // Keep the last 500 failed jobs for debugging
}

const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS, // Set default options for all jobs in this queue
})

module.exports = emailQueue
