const { Queue } = require('bullmq')
const redis = require('../../config/redis')
const { DEFAULT_JOB_OPTIONS } = require('../config/queue.config')

const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS, // Set default options for all jobs in this queue
})

module.exports = emailQueue
