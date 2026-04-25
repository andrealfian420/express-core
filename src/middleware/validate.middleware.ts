import { Request, Response, NextFunction } from 'express'
import { ZodType } from 'zod'
import AppError from '../utils/appError'

const validate = (schema: ZodType<any, any, any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))

      return next(new AppError('Validation failed', 400, errors))
    }

    req.body = result.data

    next()
  }
}

export default validate