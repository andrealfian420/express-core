// Purpose: HTTP layer for admin user management (list, show, create, update, delete).
// Caller: user.route (/api/v1/users) after authMiddleware and checkPermission.
// Dependencies: user.service, response util, user.serializer.
// Main Functions: index, show, store, update, delete.
// Side Effects: Sends HTTP responses; single-user payloads pass through toUserResponse so
//   the password hash and internal ids are never returned.
import { Request, Response, NextFunction } from 'express'
import userService from './user.service'
import response from '../../utils/response'
import { toUserResponse } from './user.serializer'

// UserController handles HTTP requests related to users.
class UserController {
  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await userService.getUsers(req)
      response(res, result, 'User list retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const slug = req.params.slug as string
      const user = await userService.getUserBySlug(slug)
      response(res, toUserResponse(user), 'User retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async store(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = {
        ...req.body,
        ...(req.file && { avatar: req.file.filename }),
      }
      const userId = req.user?.sub ? Number(req.user.sub) : null
      const user = await userService.createUser(data, userId)

      response(res, toUserResponse(user), 'User created successfully', 201)
    } catch (err) {
      next(err)
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = {
        ...req.body,
        ...(req.file && { avatar: req.file.filename }),
      }
      const slug = req.params.slug as string
      const userId = req.user?.sub ? Number(req.user.sub) : null
      const user = await userService.updateUser(slug, data, userId)
      response(res, toUserResponse(user), 'User updated successfully')
    } catch (err) {
      next(err)
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const slug = req.params.slug as string
      const userId = req.user?.sub ? Number(req.user.sub) : null
      await userService.deleteUser(slug, userId)
      response(res, null, 'User deleted successfully')
    } catch (err) {
      next(err)
    }
  }
}

export default new UserController()
