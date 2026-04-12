const { Worker } = require('bullmq')
const redis = require('../../config/redis')
const emailService = require('../../services/email.service')
const AppError = require('../../utils/appError')
const { QUEUE_NAMES } = require('../config/queue.constants')

const emailWorker = new Worker(
  QUEUE_NAMES.EMAIL,
  async (job) => {
    switch (job.name) {
      case 'sendVerificationEmail':
        await emailService.sendVerificationEmail(job.data.email, {
          name: job.data.name,
          token: job.data.token,
          link: `${process.env.APP_URL}${process.env.PORT}/api/v1/auth/verify-email?token=${job.data.token}`,
        })
        break
      case 'sendResetPasswordEmail':
        await emailService.sendResetPasswordEmail(job.data.email, {
          name: job.data.name,
          token: job.data.token,
          link: `${process.env.APP_URL}${process.env.PORT}/api/v1/auth/reset-password?token=${job.data.token}`,
        })
        break
      case 'sendVerificationSuccessEmail':
        await emailService.sendVerificationSuccessEmail(job.data.email, {
          name: job.data.name,
        })
        break
      default:
        throw new AppError(`Unknown job name: ${job.name}`, 500)
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process up to 5 jobs concurrently
  },
)

module.exports = emailWorker
