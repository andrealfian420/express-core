// Purpose: Data access for authentication: users by email, refresh tokens, email
//   verification tokens and password-reset tokens.
// Caller: auth.service, profile.service.
// Dependencies: Prisma client (optionally a transaction client).
// Main Functions: findUserByEmail, createUser, createRefreshToken, findRefreshToken,
//   deleteRefreshToken, createEmailVerificationToken, findUniqueToken,
//   deletePasswordResetToken, updatePasswordResetToken, deleteRefreshTokensByUserId.
// Side Effects: Reads and writes users, refresh_tokens, email_verification_tokens and
//   password_reset_tokens.
import prisma from '../../config/database'
import {
  EmailVerificationToken,
  PasswordResetToken,
  Prisma,
  RefreshToken,
  User,
} from '@prisma/client'
import { PrismaTx } from '../../types/prisma'

// This repository handles all database interactions related to authentication.
class AuthRepository {
  async findUserByEmail(
    email: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        email: email,
        deletedAt: null,
      },
    })
  }

  async createUser(
    userData: Prisma.UserUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User> {
    const db = txOrPrisma || prisma
    return await db.user.create({
      data: userData,
    })
  }

  async createRefreshToken(
    tokenData: Prisma.RefreshTokenUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<RefreshToken> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.create({
      data: tokenData,
    })
  }

  async findRefreshToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<RefreshToken | null> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.findFirst({
      where: {
        token: token,
      },
    })
  }

  async deleteRefreshToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<RefreshToken> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.delete({
      where: {
        token: token,
      },
    })
  }

  async createEmailVerificationToken(
    tokenData: Prisma.EmailVerificationTokenUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<EmailVerificationToken> {
    const db = txOrPrisma || prisma
    return await db.emailVerificationToken.create({
      data: tokenData,
    })
  }

  async findUniqueToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<PasswordResetToken | null> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.findUnique({
      where: {
        token: token,
      },
    })
  }

  async deletePasswordResetToken(
    token: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<PasswordResetToken> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.delete({
      where: {
        token: token,
      },
    })
  }

  async updatePasswordResetToken(
    token: string,
    data: Prisma.PasswordResetTokenUpdateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<PasswordResetToken> {
    const db = txOrPrisma || prisma
    return await db.passwordResetToken.update({
      where: {
        token: token,
      },
      data: data,
    })
  }

  async deleteRefreshTokensByUserId(
    userId: number,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Prisma.BatchPayload> {
    const db = txOrPrisma || prisma
    return await db.refreshToken.deleteMany({
      where: {
        userId: userId,
      },
    })
  }
}

export default new AuthRepository()
