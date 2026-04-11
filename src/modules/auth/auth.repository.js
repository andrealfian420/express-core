const prisma = require('../../config/database')

// This repository handles all database interactions related to authentication.
class AuthRepository {
  async findUserByEmail(email) {
    return await prisma.user.findFirst({
      where: {
        email: email,
        deletedAt: null,
      },
    })
  }

  async createUser(userData) {
    return await prisma.user.create({
      data: userData,
    })
  }

  async createRefreshToken(tokenData) {
    return await prisma.refreshToken.create({
      data: tokenData,
    })
  }

  async findRefreshToken(token) {
    return await prisma.refreshToken.findFirst({
      where: {
        token: token,
      },
    })
  }

  async deleteRefreshToken(token) {
    return await prisma.refreshToken.delete({
      where: {
        token: token,
      },
    })
  }
}

module.exports = new AuthRepository()
