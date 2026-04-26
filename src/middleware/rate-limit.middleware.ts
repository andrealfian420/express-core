import { Request, Response, NextFunction } from 'express'
import rateLimit, { Options as RateLimitOptions } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import redis from '../config/redis'
import logger from '../config/logger'

// Create a custom interface for rate limit options
// to allow for more specific typing and default values
interface CustomRateLimitOptions {
  windowMs?: number
  max?: number
}

// this is a function that creates a rate limiter middleware with customizable options
// Rate Limiters is used to limit the number of requests a client can make to the server in a given time window
const createRateLimiter = (options: CustomRateLimitOptions) => {
  return rateLimit({
    // uses Redis to store rate limit data, which allows for distributed rate limiting across multiple server instances
    store: new RedisStore({
      // the Redis store expects a sendCommand function that can execute Redis commands, we provide it by calling the redis client's call method
      // arguments are passed as an array, where the first element is the command and the rest are the command arguments
      sendCommand: (...args: string[]) =>
        redis.call(args[0], ...args.slice(1)) as any,
    }),
    windowMs: options.windowMs || 15 * 60 * 1000, // default 15 minutes
    max: options.max || 100, // default 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (
      req: Request,
      res: Response,
      next: NextFunction,
      optionsInfo: RateLimitOptions,
    ) => {
      // custom handler for when a client exceeds the rate limit
      logger.warn('Rate limit exceeded', {
        ip: req.ip || 'unknown',
        method: req.method || 'unknown',
        endpoint: req.originalUrl || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        // body: req.body || {},
        // query: req.query || {},
      })

      res.status(optionsInfo.statusCode || 429).json({
        success: false,
        message: 'Too many requests, please try again later.',
      })
    },
  })
}

// api rate limiter with default options, can be used for all API routes
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
})

// auth rate limiter with stricter options, can be used for authentication routes to prevent brute-force attacks
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
})

// Specific rate limiters for individual auth endpoints

// Login: strict limit to prevent brute-force attacks
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
})

// Register: moderate limit to prevent spam registrations
const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 registrations per windowMs
})

// Request password reset: very strict to prevent email flooding
const requestPasswordResetRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 reset requests per windowMs
})

// Reset password: strict to prevent token brute-forcing
const resetPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 reset attempts per windowMs
})

export {
  createRateLimiter,
  apiRateLimiter,
  authRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  requestPasswordResetRateLimiter,
  resetPasswordRateLimiter,
}
