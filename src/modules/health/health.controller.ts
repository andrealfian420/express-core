// Purpose: Liveness (/health) and readiness (/health/ready) endpoints.
// Caller: health.route (mounted before rate limiting); Docker/PM2 healthchecks and monitors.
// Dependencies: Prisma, Redis, logger, config/env (NODE_ENV).
// Main Functions: healthCheck, readyCheck.
// Side Effects: Runs `SELECT 1` and Redis PING; dependency details hidden in production.
import { Request, Response } from 'express'
import prisma from '../../config/database'
import logger from '../../config/logger'
import redis from '../../config/redis'
import { env } from '../../config/env'

// Health Controller to check the health of the application and its dependencies
class HealthController {
  async healthCheck(req: Request, res: Response): Promise<void> {
    const isProd = env.NODE_ENV === 'production'

    const health = {
      status: 'OK',
      uptime: process.uptime(),
      timestamp: Date.now(),
      services: {
        database: 'UNKNOWN',
        redis: 'UNKNOWN',
      },
    }

    let dbStatus: string | null = null
    let redisStatus: string | null = null

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

  async readyCheck(req: Request, res: Response): Promise<void> {
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

export default new HealthController()
