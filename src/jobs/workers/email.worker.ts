import { Worker, Job } from 'bullmq'
import redis from '../../config/redis'
import emailService from '../../services/email.service'
import AppError from '../../utils/appError'
import { QUEUE_NAMES } from '../config/queue.constants'

export interface EmailJobData {
  email: string
  name: string
  token?: string
}

const emailWorker = new Worker(
  QUEUE_NAMES.EMAIL,
  async (job: Job<EmailJobData>) => {
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

export default emailWorker
