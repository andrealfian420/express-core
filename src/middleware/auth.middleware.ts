import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import AppError from '../utils/appError'

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  let token = null

  // Check Authorization header first
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]
  }

  if (!token) {
    throw new AppError('Unauthorized', 401)
  }

  try {
    // use type assertion to tell TypeScript that JWT_ACCESS_SECRET is a string
    const secret = process.env.JWT_ACCESS_SECRET as string

    const decoded = jwt.verify(token, secret) as JwtPayload
    req.user = {
      sub: Number(decoded.sub),
    }
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}

export default authMiddleware
