/**
 * CORS configuration object.
 *
 * @property {Array<string|RegExp>} origin - Specifies the origins that are allowed to access the resources.
 * @property {Array<string>} methods - Specifies the HTTP methods that are allowed.
 * @property {Array<string>} allowedHeaders - Specifies the headers that are allowed.
 * @property {boolean} credentials - Indicates whether credentials (e.g., cookies) are allowed to be sent.
 * @property {boolean} preflightContinue - Pass the CORS preflight response to the next handler.
 * @property {number} optionsSuccessStatus - Status code to use for successful OPTIONS requests.
 * @property {number} maxAge - Indicates how long the results of a preflight request can be cached.
 */
require('dotenv').config()
module.exports = {
  origin: function (origin, callback) {
    const allowedOrigins = [/^http:\/\/localhost:\d+$/]
    if (
      !origin ||
      allowedOrigins.some((o) =>
        typeof o === 'string' ? o === origin : o.test(origin),
      )
    ) {
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

  optionsSuccessStatus: 200,

  maxAge: 86400,
}
