// Purpose: Resolve the authenticated user's role for the access gates (checkPermission,
//   checkUserType) from the versioned RBAC cache, falling back to the database.
// Caller: rbac.middleware, user-type.middleware.
// Dependencies: rbac-cache.service (versioned Redis cache), Prisma (user + role lookup), AppError.
// Main Functions: resolveRole.
// Side Effects: Redis read (entry + version in one call) and, on a miss, one database read and
//   a cache write; sets req.role. Nothing when an earlier gate already resolved this request.
import { Request } from 'express'
import AppError from '../utils/appError'
import prisma from '../config/database'
import { cacheUserAccess, readUserAccess } from '../services/rbac-cache.service'
import { CachedUserData, RoleData } from '../types/express'

// Throws 401 for a missing or deleted user and 403 for a user without a role.
export async function resolveRole(req: Request): Promise<RoleData> {
  // Chained gates share one lookup per request.
  if (req.role) return req.role

  const rawUserId = req.user?.sub
  if (!rawUserId) throw new AppError('Unauthorized access', 401)
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
            userType: true,
            access: true,
          },
        },
      },
    })) as unknown as CachedUserData | null // double casting to satisfy TypeScript

    if (!userData) throw new AppError('Unauthorized access', 401)

    await cacheUserAccess(userId, userData, version)
  }

  if (!userData.role) throw new AppError('Access denied: no role assigned', 403)

  req.role = userData.role
  return userData.role
}
