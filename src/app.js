const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const morgan = require('morgan')
const { createWriteStream } = require('fs')
const logConfig = require('./config/log.config')
const corsConfig = require('./config/cors.config')
const helmetConfig = require('./config/helmet.config')
const errorHandler = require('./middleware/error.middleware')

require('dotenv').config()

const routes = require('./routes')

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

app.use(function (req, res, next) {
  req.socket.setNoDelay(true)
  next()
})

if (process.env.ENABLECORS) {
  app.use(cors(corsConfig))
}
if (process.env.ENABLEHELMET) {
  app.use(helmet(helmetConfig))
}

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Cache-Control', 'public, max-age=86400')
    // No Vary required: cors sets it already set automatically
    res.end()
  } else {
    next()
  }
})

app.use(express.urlencoded({ limit: process.env.FORMLIMIT, extended: true })) // for parsing application/x-www-form-urlencoded
app.use(express.json({ limit: process.env.FORMLIMIT }))

if (process.env.ENABLELOG) {
  // log success responses to access.log
  if (process.env.NODE_ENV == 'development') {
    app.use(
      morgan(logConfig, {
        skip: function (req, res) {
          return !req.originalUrl.includes('api/v1') || res.statusCode >= 400
        },
        stream: createWriteStream('./client/storage/access.log', {
          flags: 'a',
        }),
      }),
    )
  }

  // log 4xx and 5xx responses to error.log
  app.use(
    morgan(logConfig, {
      skip: function (req, res) {
        return !req.originalUrl.includes('api/v1') || res.statusCode < 400
      },
      stream: createWriteStream('./client/storage/error.log', {
        flags: 'a',
      }),
    }),
  )

  app.use('/storage', express.static('./client/storage'))
}

app.use('/api/v1/', routes)

app.use(errorHandler)

module.exports = app
