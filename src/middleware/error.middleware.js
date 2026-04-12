const logger = require('../config/logger')

module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  logger.error(`${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ...(err.errors && { errors: err.errors }),
  })

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || null,
  })
}
