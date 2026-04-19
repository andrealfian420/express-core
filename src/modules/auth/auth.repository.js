const prisma = require('../../config/database')

// This repository handles all database interactions related to authentication.
class AuthRepository {
  async findUserByEmail(email, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        email: email,
        deletedAt: null,
      },
    })
  }

  async createUser(userData, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.create({
      data: userData,
    })
  }

  async createRefreshToken(tokenData, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.refreshToken.create({
      data: tokenData,
    })
  }

  async findRefreshToken(token, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.refreshToken.findFirst({
      where: {
        token: token,
      },
    })
  }

  async deleteRefreshToken(token, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.refreshToken.delete({
      where: {
        token: token,
      },
    })
  }

  async findUniqueToken(token, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.findUnique({
      where: {
        token: token,
      },
    })
  }

  async deletePasswordResetToken(token, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.delete({
      where: {
        token: token,
      },
    })
  }

  async updatePasswordResetToken(token, data, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.update({
      where: {
        token: token,
      },
      data: data,
    })
  }

  async deleteRefreshTokensByUserId(userId, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.refreshToken.deleteMany({
      where: {
        userId: userId,
      },
    })
  }
}

module.exports = new AuthRepository()
