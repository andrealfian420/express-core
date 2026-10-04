// Purpose: Morgan HTTP request logging routed through the Winston logger, so request lines
//   follow the logger's transports (stdout, optional files) instead of separate log files.
// Caller: app.ts.
// Dependencies: morgan, config/log (line format and tokens), config/logger.
// Main Functions: createHttpLogMiddleware.
// Side Effects: Writes one log entry per matching /api/v1 request: 2xx/3xx at info (only
//   when logSuccess is set), 4xx/5xx at warn.
import { Request, RequestHandler, Response } from 'express'
import morgan from 'morgan'
import logFormat from '../config/log'
import logger from '../config/logger'

export interface HttpLogOptions {
  enabled: boolean
  logSuccess: boolean
}

const isApiRequest = (req: Request): boolean =>
  req.originalUrl.includes('api/v1')

export function createHttpLogMiddleware({
  enabled,
  logSuccess,
}: HttpLogOptions): RequestHandler[] {
  if (!enabled) return []

  const handlers: RequestHandler[] = []

  if (logSuccess) {
    handlers.push(
      morgan(logFormat, {
        skip: (req: Request, res: Response) =>
          !isApiRequest(req) || res.statusCode >= 400,
        stream: {
          write: (line: string) =>
            logger.info(line.trim(), { context: 'http' }),
        },
      }),
    )
  }

  handlers.push(
    morgan(logFormat, {
      skip: (req: Request, res: Response) =>
        !isApiRequest(req) || res.statusCode < 400,
      stream: {
        write: (line: string) => logger.warn(line.trim(), { context: 'http' }),
      },
    }),
  )

  return handlers
}
