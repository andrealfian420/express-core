import { Request, Response, NextFunction } from 'express'
import logger from '../config/logger'

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'
  const isDev = process.env.NODE_ENV === 'development'

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
    ...(isDev && err.errors && { errors: err.errors }),
  })
}

export default errorHandler
