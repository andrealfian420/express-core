import { Request, Response, NextFunction } from 'express'
import AppError from '../utils/appError'
import prisma from '../config/database'
import cacheService from '../services/cache.service'

const USER_ROLE_CACHE_TTL = 300 // 5 minutes

// Define a TypeScript interface for the role data structure
interface RoleData {
  id: string | number
  slug: string
  access: string[] // Array of permission strings
}

interface CachedUserData {
  id: string | number
  role: RoleData | null
}

export interface RBACRequest extends Request {
  user?: {
    sub: string | number
    [key: string]: any
  }
  role?: RoleData
}

/**
 * RBAC middleware factory.
 * Usage: checkPermission(PERMISSIONS.DATA_MASTER.ROLE.INDEX)
 *
 * Relies on authMiddleware having already set req.user = { sub: userId }.
 */
const checkPermission = (permission: string) => {
  return async (req: RBACRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.sub
      if (!userId) {
        return next(new AppError('Unauthorized access', 401))
      }

      const cacheKey = `user-role:${userId}`
      let userData: CachedUserData | null = await cacheService.get(cacheKey)

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

        await cacheService.set(cacheKey, userData, USER_ROLE_CACHE_TTL)

        if (userData.role) {
          // Cache the role ID for quick invalidation when role permissions change
          await cacheService.sadd(
            `role-users:${userData.role.id}`,
            userId,
            USER_ROLE_CACHE_TTL,
          )
        }
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
