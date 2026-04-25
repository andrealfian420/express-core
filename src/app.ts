import express, {Request, Response, NextFunction} from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import { createWriteStream } from 'fs'
import logConfig from './config/log'
import corsConfig from './config/cors'
import helmetConfig from './config/helmet'
import errorHandler from './middleware/error.middleware'
import hpp from 'hpp'
import xssMiddleware from './middleware/xss.middleware'
import dotenv from 'dotenv'

dotenv.config()

const routes = require('./routes')
const cookieParser = require('cookie-parser')

const app = express()
app.set('trust proxy', 1)

// attackers can use this header to detect apps running Express
// and then launch specifically-targeted attacks
app.disable('x-powered-by')

// place here any middlewares that
// absolutely need to run before anything else
if (process.env.NODE_ENV == 'production') {
  app.use(compression())
}

app.use(function (req: Request, res: Response, next: NextFunction) {
  req.socket.setNoDelay(true)
  next()
})

app.use(cors(corsConfig))
app.use(helmet(helmetConfig))

app.use(express.urlencoded({ limit: process.env.FORMLIMIT, extended: true })) // for parsing application/x-www-form-urlencoded
app.use(express.json({ limit: process.env.FORMLIMIT || 52428800 }))
app.use(hpp())
app.use(cookieParser())
app.use(xssMiddleware)

if (process.env.ENABLELOG) {
  // log success responses to access.log
  if (process.env.NODE_ENV == 'development') {
    app.use(
      morgan(logConfig, {
        skip: function (req: Request, res: Response) {
          return !req.originalUrl.includes('api/v1') || res.statusCode >= 400
        },
        stream: createWriteStream('./client/storage/http-access.log', {
          flags: 'a',
        }),
      }),
    )
  }

  // log 4xx and 5xx responses to error.log
  app.use(
    morgan(logConfig, {
      skip: function (req: Request, res: Response) {
        return !req.originalUrl.includes('api/v1') || res.statusCode < 400
      },
      stream: createWriteStream('./client/storage/http-error.log', {
        flags: 'a',
      }),
    }),
  )
}

app.use('/storage', express.static('./client/storage/public'))
app.use('/api/v1/', routes)
app.use(errorHandler)

export default app
