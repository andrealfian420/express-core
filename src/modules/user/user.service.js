const userRepository = require('./user.repository')
const bcrypt = require('bcryptjs')

// UserService contains business logic related to users.
class UserService {
  async getUsers() {
    return await userRepository.getUser()
  }

  async getUserByEmail(email) {
    return await userRepository.findByEmail(email)
  }

  async createUser(data) {
    const existingUser = await userRepository.findByEmail(data.email)
    if (existingUser) {
      throw new Error('Email already in use')
    }

    data.password = await bcrypt.hash(data.password, 12)

    return await userRepository.create(data)
  }
}

module.exports = new UserService()
