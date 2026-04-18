const userService = require('./user.service')
const response = require('../../utils/response')

// UserController handles HTTP requests related to users.
class UserController {
  async index(req, res, next) {
    try {
      const result = await userService.getUsers(req)
      response(res, result, 'User list retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async show(req, res, next) {
    try {
      const user = await userService.getUserBySlug(req.params.slug)
      response(res, user, 'User retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async store(req, res, next) {
    try {
      const data = {
        ...req.body,
        ...(req.file && { avatar: req.file.filename }),
      }
      const user = await userService.createUser(data, req.user.sub)

      response(res, user, 'User created successfully', 201)
    } catch (err) {
      next(err)
    } 
  }

  async update(req, res, next) {
    try {
      const data = {
        ...req.body,
        ...(req.file && { avatar: req.file.filename }),
      }
      const user = await userService.updateUser(
        req.params.slug,
        data,
        req.user.sub,
      )
      response(res, user, 'User updated successfully')
    } catch (err) {
      next(err)
    }
  }

  async delete(req, res, next) {
    try {
      await userService.deleteUser(req.params.slug, req.user.sub)
      response(res, null, 'User deleted successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new UserController()
