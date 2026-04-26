import Redis from 'ioredis'
import logger from './logger'

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  maxRetriesPerRequest: null,
})

redis.on('error', (err: Error) => {
  logger.error('Redis error:', { err: err.message })
})

redis.on('connect', () => {
  logger.info('Redis connected')
})

export default redis
