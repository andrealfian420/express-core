const userService = require('./user.service')

// UserController handles HTTP requests related to users.
class UserController {
  async index(req, res, next) {
    try {
      const result = await userService.getUsers(req)
      res.status(200).json({
        success: true,
        ...result,
      })
    } catch (err) {
      next(err)
    }
  }

  async show(req, res, next) {
    try {
      const user = await userService.getUserBySlug(req.params.slug)
      res.status(200).json({
        success: true,
        data: user,
      })
    } catch (err) {
      next(err)
    }
  }

  async store(req, res, next) {
    try {
      const user = await userService.createUser(req.body)
      res.status(201).json({
        success: true,
        data: user,
      })
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      const user = await userService.updateUser(req.params.slug, req.body)
      res.status(200).json({
        success: true,
        data: user,
      })
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new UserController()
