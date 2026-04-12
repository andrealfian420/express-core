const AppError = require('../utils/appError')
const prisma = require('../config/database')
const cacheService = require('../services/cache.service')

const USER_ROLE_CACHE_TTL = 300 // 5 minutes

/**
 * RBAC middleware factory.
 * Usage: checkPermission(PERMISSIONS.DATA_MASTER.ROLE.INDEX)
 *
 * Relies on authMiddleware having already set req.user = { sub: userId }.
 */
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.sub
      if (!userId) {
        return next(new AppError('Unauthorized access', 401))
      }

      const cacheKey = `user-role:${userId}`
      let userData = await cacheService.get(cacheKey)

      if (!userData) {
        userData = await prisma.user.findFirst({
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
        })

        if (!userData) {
          return next(new AppError('Unauthorized access', 401))
        }

        await cacheService.set(cacheKey, userData, USER_ROLE_CACHE_TTL)

        // Cache the role ID for quick invalidation when role permissions change
        await cacheService.sadd(
          `role-users:${userData.role.id}`,
          userId,
          USER_ROLE_CACHE_TTL,
        )
      }

      if (!userData.role) {
        return next(new AppError('Access denied: no role assigned', 403))
      }

      const grantedAccess = Array.isArray(userData.role.access)
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

module.exports = checkPermission
