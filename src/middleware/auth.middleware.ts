import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import AppError from '../utils/appError'

// Extend Express Request interface to include user property
export interface AuthRequest extends Request {
  // JwtPayload is a type from jsonwebtoken that represents the decoded token payload
  user?: string | JwtPayload
}

const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  let token = null

  // Check Authorization header first (mobile clients may use this instead of cookies)
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

    const decoded = jwt.verify(token, secret)
    req.user = decoded
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}

export default authMiddleware
