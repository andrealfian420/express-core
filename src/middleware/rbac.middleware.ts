// Purpose: RBAC permission check for protected routes.
// Caller: Module routes, after authMiddleware (checkPermission(PERMISSIONS....)).
// Dependencies: rbac-cache.service (versioned Redis cache), Prisma (user + role lookup), AppError.
// Main Functions: checkPermission (default export).
// Side Effects: Redis read (entry + version in one call) and, on a miss, one database read and
//   a cache write; sets req.role.
import { Request, Response, NextFunction } from 'express'
import AppError from '../utils/appError'
import prisma from '../config/database'
import { cacheUserAccess, readUserAccess } from '../services/rbac-cache.service'

// Import the interfaces from the extended Express types
import { CachedUserData } from '../types/express'

/**
 * RBAC middleware factory.
 * Usage: checkPermission(PERMISSIONS.DATA_MASTER.ROLE.INDEX)
 *
 * Relies on authMiddleware having already set req.user = { sub: userId }.
 */
const checkPermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawUserId = req.user?.sub
      if (!rawUserId) {
        return next(new AppError('Unauthorized access', 401))
      }

      const userId = Number(rawUserId)

      // The version is read before the database so a refill can never carry newer data's stamp.
      const { cached, version } = await readUserAccess(userId)
      let userData: CachedUserData | null = cached

      if (!userData) {
        userData = (await prisma.user.findFirst({
          where: { id: userId, deletedAt: null },
          select: {
            id: true,
            role: {
              select: {
                id: true,
                slug: true,
                access: true,
              },
            },
          },
        })) as unknown as CachedUserData | null // double casting to satisfy TypeScript

        if (!userData) {
          return next(new AppError('Unauthorized access', 401))
        }

        await cacheUserAccess(userId, userData, version)
      }

      if (!userData.role) {
        return next(new AppError('Access denied: no role assigned', 403))
      }

      const grantedAccess: string[] = Array.isArray(userData.role.access)
        ? userData.role.access
        : []

      if (!grantedAccess.includes(permission)) {
        return next(
          new AppError(
            `You do not have permission to perform this action`,
            403,
          ),
        )
      }

      // Attach role info for downstream use
      req.role = userData.role
      next()
    } catch (err) {
      next(err)
    }
  }
}

export default checkPermission
