import prisma from '../../config/database'
import { PasswordResetToken, Prisma, RefreshToken, User } from '@prisma/client'

// This repository handles all database interactions related to authentication.
class AuthRepository {
  async findUserByEmail(email: string, txOrPrisma: any = null): Promise<User | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        email: email,
        deletedAt: null,
      },
    })
  }

  async createUser(userData: Prisma.UserUncheckedCreateInput, txOrPrisma: any = null): Promise<User> {
    const db = txOrPrisma || prisma
    return await db.user.create({
      data: userData,
    })
  }

  async createRefreshToken(tokenData: Prisma.RefreshTokenUncheckedCreateInput, txOrPrisma: any = null): Promise<RefreshToken> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.create({
      data: tokenData,
    })
  }

  async findRefreshToken(token: string, txOrPrisma: any = null): Promise<RefreshToken | null> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.findFirst({
      where: {
        token: token,
      },
    })
  }

  async deleteRefreshToken(token: string, txOrPrisma: any = null): Promise<RefreshToken> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.delete({
      where: {
        token: token,
      },
    })
  }

  async findUniqueToken(token: string, txOrPrisma: any = null): Promise<PasswordResetToken | null> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.findUnique({
      where: {
        token: token,
      },
    })
  }

  async deletePasswordResetToken(token: string, txOrPrisma: any = null): Promise<PasswordResetToken> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.delete({
      where: {
        token: token,
      },
    })
  }

  async updatePasswordResetToken(token: string, data: Prisma.PasswordResetTokenUpdateInput, txOrPrisma: any = null): Promise<PasswordResetToken> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.update({
      where: {
        token: token,
      },
      data: data,
    })
  }

  async deleteRefreshTokensByUserId(userId: number, txOrPrisma: any = null): Promise<Prisma.BatchPayload> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.deleteMany({
      where: {
        userId: userId,
      },
    })
  }
}

export default new AuthRepository()
