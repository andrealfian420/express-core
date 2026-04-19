const rateLimit = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const redis = require('../config/redis')
const logger = require('../config/logger')

// this is a function that creates a rate limiter middleware with customizable options
// Rate Limiters is used to limit the number of requests a client can make to the server in a given time window
const createRateLimiter = (options) => {
  return rateLimit({
    // uses Redis to store rate limit data, which allows for distributed rate limiting across multiple server instances
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
    }),
    windowMs: options.windowMs || 15 * 60 * 1000, // default 15 minutes
    max: options.max || 100, // default 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next, options) => {
      // custom handler for when a client exceeds the rate limit
      logger.warn('Rate limit exceeded', {
        ip: req.ip || 'unknown',
        method: req.method || 'unknown',
        endpoint: req.originalUrl || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        // body: req.body || {},
        // query: req.query || {},
      })

      res.status(options.statusCode).json({
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

// TODO: separate rate limiters for login, register, password reset, etc. with different limits and windows

module.exports = {
  createRateLimiter,
  apiRateLimiter,
  authRateLimiter,
}
