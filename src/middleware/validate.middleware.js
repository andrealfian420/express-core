const AppError = require('../utils/appError')

module.exports = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path[0],
        message: e.message,
      }))

      return next(new AppError('Validation failed', 400, errors))
    }

    req.body = result.data

    next()
  }
}
