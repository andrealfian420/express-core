const jwt = require('jsonwebtoken')
const AppError = require('../utils/appError')

module.exports = (req, res, next) => {
  let token = null

  // Check Authorization header first (mobile clients may use this instead of cookies)
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]
  }

  // Fallback to accessToken cookie if no Authorization header
  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken
  }

  if (!token) {
    throw new AppError('Unauthorized', 401)
  }

  console.log(token)

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}
