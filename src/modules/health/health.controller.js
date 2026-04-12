const prisma = require('../../config/database')
const logger = require('../../config/logger')
const redis = require('../../config/redis')

// Health Controller to check the health of the application and its dependencies
class HealthController {
  async healthCheck(req, res) {
    const isProd = process.env.NODE_ENV === 'production'

    const health = {
      status: 'OK',
      uptime: process.uptime(),
      timestamp: Date.now(),
      services: {},
    }

    let dbStatus = null
    let redisStatus = null

    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`
      dbStatus = 'UP'
    } catch {
      dbStatus = 'DOWN'
      logger.error('Database connection failed')
    }

    try {
      // Check Redis connection
      await redis.ping()
      redisStatus = 'UP'
    } catch {
      redisStatus = 'DOWN'
      logger.error('Redis connection failed')
    }

    if (!isProd) {
      health.services.database = dbStatus
      health.services.redis = redisStatus
      health.uptime = process.uptime()
      health.timestamp = Date.now()
    }

    res.status(200).json(health)
  }

  async readyCheck(req, res) {
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()

      logger.info('Readiness check passed')
      res.status(200).json({ status: 'READY' })
    } catch (error) {
      logger.error('Readiness check failed', { error })
      res.status(503).json({ status: 'NOT_READY' })
    }
  }
}

module.exports = new HealthController()
