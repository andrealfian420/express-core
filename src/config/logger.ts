// Purpose: Configure runtime logging, silent and file-free during automated tests.
// Caller: Application modules, API server and worker processes.
// Dependencies: Winston, path, NODE_ENV.
// Main Functions: logger (default export).
// Side Effects: Writes log files under client/storage/logs outside tests; console output outside production.
import winston from 'winston'
import path from 'path'

const logDir = path.join(process.cwd(), 'client/storage/logs')
const isTest = process.env.NODE_ENV === 'test'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: isTest
    ? [new winston.transports.Console({ silent: true })]
    : [
        new winston.transports.File({
          filename: `${logDir}/error.log`,
          level: 'error',
        }),
        new winston.transports.File({
          filename: `${logDir}/combined.log`,
        }),
      ],
})

if (process.env.NODE_ENV !== 'production' && !isTest) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  )
}

export default logger
