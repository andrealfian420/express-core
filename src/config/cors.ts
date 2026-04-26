import 'dotenv/config'
import { CorsOptions } from 'cors'

/**
 * CORS configuration options.
 *
 * This configuration dictates which origins are allowed to access the API,
 * the permitted HTTP methods, allowed headers, and preflight caching rules.
 */
const origins: string[] = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .filter(Boolean)
  .map((o) => o.trim())

const corsOptions: CorsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // or requests from an explicitly allowed origin
    if (!origin || origins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-TOKEN',
    'X-TIMESTAMP',
    'X-Requested-With',
  ],

  credentials: true,

  // If true, the CORS preflight response will be passed to the next handler instead of ending the request
  preflightContinue: false,

  optionsSuccessStatus: 200,

  // Indicates how long (in seconds) the results of a preflight request can be cached
  maxAge: 86400,
}

export default corsOptions
