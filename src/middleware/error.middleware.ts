// Purpose: Global Express error handler producing the standard error envelope.
// Caller: app.ts (registered last).
// Dependencies: config/logger, config/env (NODE_ENV).
// Main Functions: errorHandler (default export).
// Side Effects: Logs every error. Responses carry field errors for client errors (4xx) in every
//   environment; server errors (5xx) include field errors and the stack only in development.
import { Request, Response, NextFunction } from 'express'
import logger from '../config/logger'
import { env } from '../config/env'

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'
  const isDev = env.NODE_ENV === 'development'
  // A 4xx detail list (e.g. validation) only describes what the caller sent and tells them what
  // to fix; details attached to server errors may describe internals.
  const exposeErrors = Boolean(err.errors) && (statusCode < 500 || isDev)

  logger.error(`${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ...(err.errors && { errors: err.errors }),
  })

  res.status(statusCode).json({
    success: false,
    message,
    ...(isDev && { stack: err.stack }),
    ...(exposeErrors && { errors: err.errors }),
  })
}

export default errorHandler
