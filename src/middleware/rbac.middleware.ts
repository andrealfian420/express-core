// Purpose: RBAC permission check for protected routes.
// Caller: Module routes, after authMiddleware (checkPermission(PERMISSIONS....)).
// Dependencies: resolve-role (versioned RBAC cache + Prisma lookup), AppError.
// Main Functions: checkPermission (default export).
// Side Effects: Through resolveRole: Redis read (entry + version in one call) and, on a miss,
//   one database read and a cache write; none when an earlier gate already resolved the role;
//   sets req.role.
import { Request, Response, NextFunction } from 'express'
import AppError from '../utils/appError'
import { resolveRole } from './resolve-role'

/**
 * RBAC middleware factory.
 * Usage: checkPermission(PERMISSIONS.DATA_MASTER.ROLE.INDEX)
 *
 * Relies on authMiddleware having already set req.user = { sub: userId }.
 */
const checkPermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await resolveRole(req)

      const grantedAccess: string[] = Array.isArray(role.access)
        ? role.access
        : []

      if (!grantedAccess.includes(permission)) {
        return next(
          new AppError(
            `You do not have permission to perform this action`,
            403,
          ),
        )
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

export default checkPermission
