// Purpose: HTTP handlers for role management plus the role editor's catalogues (permission
//   tree and user types).
// Caller: role.route.
// Dependencies: role.service, role.permissions (ACCESS_LIST), role.user-types (USER_TYPES),
//   utils/response.
// Main Functions: index, show, store, update, destroy, accessList, userTypes.
// Side Effects: Through role.service: role and activity-log writes, RBAC cache invalidation.
import { Request, Response, NextFunction } from 'express'
import roleService from './role.service'
import { ACCESS_LIST } from './role.permissions'
import { USER_TYPES } from './role.user-types'
import response from '../../utils/response'

// Controller functions for Role management
class RoleController {
  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await roleService.getRoles(req)
      response(res, result, 'Roles retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await roleService.getRole(req.params?.slug as string)
      response(res, role, 'Role retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async store(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await roleService.createRole(req.body, req.user?.sub)
      response(res, role, 'Role created successfully', 201)
    } catch (err) {
      next(err)
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = await roleService.updateRole(
        req.params?.slug as string,
        req.body,
        req.user?.sub,
      )
      response(res, role, 'Role updated successfully')
    } catch (err) {
      next(err)
    }
  }

  async destroy(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await roleService.deleteRole(req.params?.slug as string, req.user?.sub)
      response(res, null, 'Role deleted successfully')
    } catch (err) {
      next(err)
    }
  }

  // Returns the full permission tree for Frontend consumption
  accessList(req: Request, res: Response): void {
    response(res, ACCESS_LIST, 'Access list retrieved successfully')
  }

  // Returns the user types a role may carry, for the role editor
  userTypes(req: Request, res: Response): void {
    response(res, USER_TYPES, 'User types retrieved successfully')
  }
}

export default new RoleController()
