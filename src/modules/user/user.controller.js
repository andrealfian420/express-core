const userService = require('./user.service')

// UserController handles HTTP requests related to users.
class UserController {
  async index(req, res) {
    try {
      const users = await userService.getUsers()
      res.status(200).json({
        success: true,
        data: users,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async store(req, res) {
    try {
      const user = await userService.createUser(req.body)
      res.status(201).json({
        success: true,
        data: user,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
}

module.exports = new UserController()
