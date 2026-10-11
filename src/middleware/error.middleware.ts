// Purpose: Global Express error handler producing the standard error envelope.
// Caller: app.ts (registered last).
// Dependencies: config/logger, config/env (NODE_ENV).
// Main Functions: errorHandler (default export).
// Side Effects: Logs every error with its original message and stack. Responses carry the
//   message of AppErrors and client errors (4xx); any other server error answers
//   "Internal Server Error" outside development, so library/database messages (table and
//   column names, SQL fragments) never reach clients. Field errors are returned for 4xx in
//   every environment; 5xx field errors and the stack only in development.
// Notes: Multer limit errors (file too large, unexpected field) are client errors: 413/400.
import { Request, Response, NextFunction } from 'express'
import logger from '../config/logger'
import { MulterError } from 'multer'
import { env } from '../config/env'
import AppError from '../utils/appError'

function statusOf(err: any): number {
  if (err instanceof MulterError) return err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
  return err.statusCode || 500
}

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode = statusOf(err)
  const isDev = env.NODE_ENV === 'development'
  // AppError messages are written for clients; other errors are only trusted below 500
  // (e.g. body-parser's malformed-JSON 400).
  const exposeMessage = err instanceof AppError || statusCode < 500 || isDev
  const message = (exposeMessage && err.message) || 'Internal Server Error'
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
