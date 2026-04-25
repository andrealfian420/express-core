class AppError extends Error {
  statusCode: number
  errors: any

  constructor(message: string, statusCode: number = 500, errors: any = null) {
    super(message)
    this.statusCode = statusCode
    this.errors = errors

    Error.captureStackTrace(this, this.constructor)
  }
}

export default AppError
