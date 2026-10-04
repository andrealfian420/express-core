// Purpose: Authenticate protected routes with an `Authorization: Bearer <JWT>` access token.
// Caller: Module routes (users, profile, roles, activity logs, utils).
// Dependencies: jsonwebtoken, config/env (JWT_ACCESS_SECRET), AppError.
// Main Functions: authMiddleware (default export).
// Side Effects: Sets req.user.sub; cookies are never accepted here.
import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import AppError from '../utils/appError'
import { env } from '../config/env'

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
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload
    req.user = {
      sub: Number(decoded.sub),
    }
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}

export default authMiddleware
