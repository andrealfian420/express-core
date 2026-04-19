const Redis = require('ioredis')
const logger = require('./logger')

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
})

redis.on('error', (err) => {
  logger.error('Redis error:', { err: err.message })
})

redis.on('connect', () => {
  logger.info('Redis connected')
})

module.exports = redis
