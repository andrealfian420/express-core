// This file defines the default job options for all jobs added to the queues in the application.
// It centralizes the configuration for retry attempts, backoff strategy, and job cleanup policies.

const DEFAULT_JOB_OPTIONS = {
  attempts: 3, // Number of retry attempts for failed jobs
  backoff: {
    // Backoff strategy for retries
    type: 'exponential', // Use exponential backoff
    delay: 5000, // Initial delay of 5 seconds before the first retry, will increase exponentially for subsequent retries
  },
  removeOnComplete: 100, // Keep the last 100 completed jobs in the queue, older ones will be automatically removed
  removeOnFail: 500, // Keep the last 500 failed jobs in the queue, older ones will be automatically removed
}

module.exports = {
  DEFAULT_JOB_OPTIONS,
}
