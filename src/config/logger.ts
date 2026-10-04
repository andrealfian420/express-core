// Purpose: Configure runtime logging: JSON to stdout in production, readable console output in
//   development, optional log files, and silence during automated tests.
// Caller: Application modules, API server and worker processes.
// Dependencies: Winston, path, config/env (NODE_ENV, LOG_TO_FILES).
// Main Functions: logger (default export).
// Side Effects: Writes to stdout outside tests; writes error.log and combined.log under
//   client/storage/logs only when LOG_TO_FILES=true (that directory must be writable).
import winston from 'winston'
import path from 'path'
import { env } from './env'

const logDir = path.join(process.cwd(), 'client/storage/logs')
const isTest = env.NODE_ENV === 'test'

// Production keeps the structured JSON format so `docker logs` / `pm2 logs` stay parseable.
const consoleTransport = new winston.transports.Console({
  silent: isTest,
  ...(env.NODE_ENV === 'production' ? {} : { format: winston.format.simple() }),
})

const fileTransports =
  env.LOG_TO_FILES && !isTest
    ? [
        new winston.transports.File({
          filename: `${logDir}/error.log`,
          level: 'error',
        }),
        new winston.transports.File({
          filename: `${logDir}/combined.log`,
        }),
      ]
    : []

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [consoleTransport, ...fileTransports],
})

export default logger
