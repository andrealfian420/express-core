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
      const user = await userService.createUser(req.body, req.user.sub)
      response(res, user, 'User created successfully', 201)
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      const user = await userService.updateUser(
        req.params.slug,
        req.body,
        req.user.sub,
      )
      response(res, user, 'User updated successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new UserController()
