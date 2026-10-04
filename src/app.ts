// Purpose: Configure the Express API, global middleware, and static file serving.
// Caller: src/server.ts and isolated HTTP tests (tests/support/http.ts).
// Dependencies: Express, security middleware, routes, config/env, config/storage,
//   http-log middleware.
// Main Functions: app (default export).
// Side Effects: Serves HTTP requests and uploaded files; when ENABLELOG is true, request lines
//   go to the application logger (no separate HTTP log files).
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { env } from './config/env'
import corsConfig from './config/cors'
import helmetConfig from './config/helmet'
import errorHandler from './middleware/error.middleware'
import { createHttpLogMiddleware } from './middleware/http-log.middleware'
import hpp from 'hpp'
import xssMiddleware from './middleware/xss.middleware'

import routes from './routes'
import cookieParser from 'cookie-parser'
import { storageRoot } from './config/storage'

const app = express()
app.set('trust proxy', 1)

// attackers can use this header to detect apps running Express
// and then launch specifically-targeted attacks
app.disable('x-powered-by')

// place here any middlewares that
// absolutely need to run before anything else
if (env.NODE_ENV === 'production') {
  app.use(compression())
}

app.use(function (req: Request, res: Response, next: NextFunction) {
  req.socket.setNoDelay(true)
  next()
})

app.use(cors(corsConfig))
app.use(helmet(helmetConfig))

app.use(express.urlencoded({ limit: env.FORMLIMIT, extended: true })) // for parsing application/x-www-form-urlencoded
app.use(express.json({ limit: env.FORMLIMIT }))
app.use(hpp())
app.use(cookieParser())
app.use(xssMiddleware)

// Request logging: 4xx/5xx always, successful /api/v1 requests in development only.
for (const handler of createHttpLogMiddleware({
  enabled: env.ENABLELOG,
  logSuccess: env.NODE_ENV === 'development',
})) {
  app.use(handler)
}

app.use('/storage', express.static(storageRoot))
app.use('/api/v1/', routes)
app.use(errorHandler)

export default app
