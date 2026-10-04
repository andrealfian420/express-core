// Purpose: CORS policy for the API — allowlisted browser origins with credentials.
// Caller: app.ts (global cors middleware).
// Dependencies: cors types, config/origins (ALLOWED_ORIGINS), AppError.
// Main Functions: corsOptions (default export).
// Side Effects: None; a disallowed Origin is passed to the error handler as a 403 AppError.
import 'dotenv/config'
import { CorsOptions } from 'cors'
import { isAllowedOrigin } from './origins'
import AppError from '../utils/appError'

/**
 * CORS configuration options.
 *
 * This configuration dictates which origins are allowed to access the API,
 * the permitted HTTP methods, allowed headers, and preflight caching rules.
 */
const corsOptions: CorsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // or requests from an explicitly allowed origin
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true)
    } else {
      // Reject the request itself (not only the CORS headers) so a disallowed browser
      // origin cannot trigger side effects; 403 because the request is refused, not broken.
      callback(new AppError('Not allowed by CORS', 403))
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
