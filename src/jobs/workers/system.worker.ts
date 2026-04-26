import { Worker, Job } from 'bullmq'
import redis from '../../config/redis'
import AppError from '../../utils/appError'
import { QUEUE_NAMES } from '../config/queue.constants'
import systemService from '../../services/system.service'

export interface SystemJobData {
  // Define the structure of your system job data here
}

const systemWorker = new Worker(
  QUEUE_NAMES.SYSTEM,
  async (job: Job<SystemJobData>) => {
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

export default systemWorker
