const prisma = require('../../config/database')

// UserRepository handles all database operations related to the User model
class UserRepository {
  async getUser() {
    return await prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isEmailVerified: true,
      }
    })
  }

  async findByEmail(email) {
    return await prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    })
  }

  async create(data) {
    return await prisma.user.create({
      data,
    })
  }
}

module.exports = new UserRepository()
