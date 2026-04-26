import { Queue } from 'bullmq'
import redis from '../../config/redis'
import { DEFAULT_JOB_OPTIONS } from '../config/queue.config'
import { QUEUE_NAMES } from '../config/queue.constants'

const systemQueue = new Queue(QUEUE_NAMES.SYSTEM, {
  connection: redis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS, // Set default options for all jobs in this queue
})

export default systemQueue
