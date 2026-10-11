// Purpose: Gate a route by the user's role type (Role.userType), for areas meant for one kind
//   of user (e.g. a member-only API) rather than for a single permission. Complements
//   checkPermission and can be chained with it.
// Caller: Module routes, after authMiddleware (checkUserType('Member')); no core route uses it.
// Dependencies: resolve-role (versioned RBAC cache + Prisma lookup), role.user-types, AppError.
// Main Functions: checkUserType (default export).
// Side Effects: Through resolveRole: Redis read and, on a miss, one database read and a cache
//   write; none when an earlier gate already resolved the role; sets req.role. Throws while
//   routes are defined when given no type or a type outside USER_TYPES.
import { Request, Response, NextFunction } from 'express'
import AppError from '../utils/appError'
import { resolveRole } from './resolve-role'
import {
  USER_TYPES,
  UserType,
  isUserType,
} from '../modules/role/role.user-types'

/**
 * User-type middleware factory.
 * Usage: checkUserType('Member') or checkUserType('Administrator', 'Member')
 *
 * Relies on authMiddleware having already set req.user = { sub: userId }.
 */
const checkUserType = (...allowedTypes: UserType[]) => {
  // A misspelled type would deny everyone without notice, so refuse it at startup instead.
  if (!allowedTypes.length || !allowedTypes.every(isUserType)) {
    throw new Error(
      `checkUserType needs types from USER_TYPES (${USER_TYPES.join(', ')}); got: ${
        allowedTypes.join(', ') || 'none'
      }`,
    )
  }
  const allowed = new Set<string>(allowedTypes)

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await resolveRole(req)

      if (!allowed.has(role.userType)) {
        return next(new AppError('Access denied', 403))
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

export default checkUserType
