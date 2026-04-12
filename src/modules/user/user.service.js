const AppError = require('../../utils/appError')
const userRepository = require('./user.repository')
const bcrypt = require('bcryptjs')
const cacheService = require('../../services/cache.service')

// UserService contains business logic related to users.
class UserService {
  async getUsers() {
    return await userRepository.getUser()
  }

  async getUserByEmail(email) {
    const cacheKey = `user:${email}`
    const cachedUser = await cacheService.get(cacheKey)

    if (cachedUser) {
      return cachedUser
    }

    const user = await userRepository.findByEmail(email)
    await cacheService.set(cacheKey, user, 300) // cache for 5 minutes

    return user
  }

  async createUser(data) {
    const existingUser = await userRepository.findByEmail(data.email)
    if (existingUser) {
      throw new AppError('Email already in use', 400)
    }

    data.password = await bcrypt.hash(data.password, 12)

    return await userRepository.create(data)
  }
}

module.exports = new UserService()
