// Purpose: Shared ioredis connection for cache, rate limiting and BullMQ queues/workers.
// Caller: cache.service, rate-limit middleware, queues, workers, health checks, shutdown.
// Dependencies: ioredis, config/env (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD), logger.
// Main Functions: redis (default export), closeRedis.
// Side Effects: Opens a TCP connection to Redis at import time and reconnects on failure.
import Redis from 'ioredis'
import { env } from './env'
import logger from './logger'

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
})

redis.on('error', (err: Error) => {
  logger.error('Redis error:', { err: err.message })
})

redis.on('connect', () => {
  logger.info('Redis connected')
})

// QUIT waits for Redis; while disconnected it would wait forever, so drop the socket instead.
export async function closeRedis(): Promise<void> {
  if (redis.status === 'end') return
  if (redis.status === 'ready') {
    await redis.quit()
  } else {
    redis.disconnect()
  }
}

export default redis
