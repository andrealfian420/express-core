/*
 * Utility function to send standardized JSON responses
 */
const response = (res, data = null, message = 'OK', statusCode = 200) => {
  res.status(statusCode).json({
    success: statusCode < 400,
    message,
    data,
  })
}

module.exports = response
