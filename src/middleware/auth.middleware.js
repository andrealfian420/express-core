const jwt = require('jsonwebtoken')
const AppError = require('../utils/appError')

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    return next(new AppError('Unauthorized access', 401))
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}
