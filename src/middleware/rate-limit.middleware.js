const rateLimit = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const redis = require('../config/redis')

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
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  })
}

// api rate limiter with default options, can be used for all API routes
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})

module.exports = {
  createRateLimiter,
  apiRateLimiter,
}
