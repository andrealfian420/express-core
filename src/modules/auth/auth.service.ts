// Purpose: Authentication business logic: registration with email verification, login,
//   refresh-token rotation, logout, email verification and password reset.
// Caller: auth.controller; integration tests.
// Dependencies: auth.repository, user.repository, outbox.repository, Prisma transactions,
//   bcrypt, token/JWT utils, cache.service, logger, config/env (token lifetimes, bcrypt cost).
// Main Functions: register, login, refreshAccessToken, logout, verifyEmail,
//   requestPasswordReset, resetPassword.
// Side Effects: Writes users and refresh/verification/reset tokens; records verification,
//   verified-notice and password-reset email intents in the outbox inside the same
//   transaction (tokens travel only in the job payload, never in HTTP responses; nothing
//   touches Redis on these request paths); invalidates cached profiles.
import bcrypt from 'bcryptjs'
import authRepository from './auth.repository'
import { generateToken, hashToken } from '../../utils/token'
import { Prisma } from '@prisma/client'
import prisma from '../../config/database'
import AppError from '../../utils/appError'
import { generateAccessToken } from '../../utils/jwt'
import outboxRepository from '../outbox/outbox.repository'
import { EMAIL_JOBS, QUEUE_NAMES } from '../../jobs/config/queue.constants'
import logger from '../../config/logger'
import { makeUniqueSlug } from '../../utils/sluggable'
import userRepository from '../user/user.repository'
import cacheService from '../../services/cache.service'
import { PrismaTx } from '../../types/prisma'
import { AuthTokens, RegisterData } from './auth.types'
import { env } from '../../config/env'

const {
  BCRYPT_ROUNDS,
  REFRESH_TOKEN_EXPIRES_DAYS,
  EMAIL_VERIFICATION_EXPIRES_HOURS,
  PASSWORD_RESET_EXPIRES_MINUTES,
} = env

// This service contains the business logic for authentication-related operations.
class AuthService {
  async register(
    userData: Prisma.UserUncheckedCreateInput,
  ): Promise<RegisterData> {
    // Use transaction to ensure user and verification token are created atomically
    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const existingUser = await authRepository.findUserByEmail(
        userData.email as string,
        tx,
      )

      if (existingUser) {
        throw new AppError('Email already in use', 400)
      }

      const hashedPassword = await bcrypt.hash(
        userData.password as string,
        BCRYPT_ROUNDS,
      )

      const slug = await makeUniqueSlug(
        userData.name as string,
        (candidate, excludeId) =>
          tx.user.findFirst({
            where: {
              slug: candidate,
              deletedAt: null,
              ...(excludeId ? { id: { not: Number(excludeId) } } : {}),
            },
          }),
      )

      const user = await authRepository.createUser(
        {
          name: userData.name,
          slug,
          email: userData.email,
          password: hashedPassword,
        },
        tx,
      )

      const { password, ...safeUserData } = user

      const token = generateToken()

      await authRepository.createEmailVerificationToken(
        {
          token: token,
          userId: user.id,
          expiresAt: new Date(
            Date.now() + EMAIL_VERIFICATION_EXPIRES_HOURS * 3600000,
          ),
        },
        tx,
      )

      // The token stays internal: only the email intent carries it, never the response.
      await outboxRepository.enqueue(tx, QUEUE_NAMES.EMAIL, EMAIL_JOBS.VERIFICATION, {
        email: user.email,
        name: user.name,
        token,
      })

      return { user: safeUserData }
    })

    logger.info(`New user registered: ${result.user.email}`)

    return { user: result.user }
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await authRepository.findUserByEmail(email)

    if (!user || !user.isEmailVerified) {
      throw new AppError(
        'Unable to sign in. Please verify your credentials or activate your account first.',
        401,
      )
    }

    const isMatch = await bcrypt.compare(password, user.password as string)
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401)
    }

    const accessToken = generateAccessToken(user)
    const refreshToken = generateToken()

    logger.info(`User ${user.email} logged in`)

    await authRepository.createRefreshToken({
      token: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 86400000),
    })

    return { accessToken, refreshToken }
  }

  async refreshAccessToken(token: string): Promise<AuthTokens> {
    if (!token) {
      throw new AppError('Refresh token required', 401)
    }

    // Use transaction to ensure token rotation is atomic (delete old token and create new one)
    return await prisma.$transaction(async (tx: PrismaTx) => {
      const hashedToken = hashToken(token)
      const record = await authRepository.findRefreshToken(hashedToken, tx)

      if (!record) {
        throw new AppError('Invalid refresh token', 401)
      }

      if (record.expiresAt < new Date()) {
        await authRepository.deleteRefreshToken(hashedToken, tx)
        throw new AppError('Refresh token expired', 401)
      }

      // Rotate refresh token: delete old one and create a new one
      const newRefreshToken = generateToken()
      await authRepository.deleteRefreshToken(hashedToken, tx)
      await authRepository.createRefreshToken(
        {
          token: hashToken(newRefreshToken),
          userId: record.userId,
          expiresAt: new Date(
            Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 86400000,
          ),
        },
        tx,
      )

      const accessToken = generateAccessToken({ id: record.userId })
      const refreshToken = newRefreshToken

      return { accessToken, refreshToken }
    })
  }

  async logout(token: string): Promise<void> {
    const hashedToken = hashToken(token)
    const record = await authRepository.findRefreshToken(hashedToken)

    if (!record) {
      throw new AppError('Invalid refresh token', 401)
    }

    await cacheService.del(`profile:${record.userId}`) // Invalidate cached profile on logout
    await authRepository.deleteRefreshToken(hashedToken)
  }

  async verifyEmail(token: string): Promise<void> {
    // Use transaction to ensure user update and token deletion are atomic
    const user = await prisma.$transaction(async (tx: PrismaTx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: {
          token: token,
        },
      })

      if (!record) {
        throw new AppError('Invalid token', 400)
      }

      if (record.expiresAt < new Date()) {
        await tx.emailVerificationToken.delete({
          where: {
            token: token,
          },
        })
        throw new AppError('Token expired', 400)
      }

      const updatedUser = await tx.user.update({
        where: {
          id: record.userId,
        },
        data: {
          isEmailVerified: true,
        },
      })

      await tx.emailVerificationToken.delete({
        where: {
          token: token,
        },
      })

      await outboxRepository.enqueue(
        tx,
        QUEUE_NAMES.EMAIL,
        EMAIL_JOBS.VERIFICATION_SUCCESS,
        { email: updatedUser.email, name: updatedUser.name },
      )

      return updatedUser
    })

    logger.info(`Email verified successfully for user: ${user.email}`)
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await authRepository.findUserByEmail(email)

    if (!user) {
      return // Don't reveal that the email doesn't exist
    }

    const token = generateToken()

    // One transaction: only the newest link stays valid, and the email intent exists
    // exactly when the token does.
    await prisma.$transaction(async (tx: PrismaTx) => {
      await authRepository.deleteUnusedPasswordResetTokens(user.id, tx)
      await authRepository.createPasswordResetToken(
        {
          token,
          userId: user.id,
          expiresAt: new Date(
            Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60000,
          ),
        },
        tx,
      )
      await outboxRepository.enqueue(tx, QUEUE_NAMES.EMAIL, EMAIL_JOBS.RESET_PASSWORD, {
        email: user.email,
        name: user.name,
        token,
      })
    })

    logger.info(`Password reset requested for user: ${user.email}`)
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Use transaction to ensure password update and token marking are atomic
    const userId = await prisma.$transaction(async (tx: PrismaTx) => {
      const record = await authRepository.findUniqueToken(token, tx)

      if (!record) {
        throw new AppError('Invalid token', 400)
      }

      if (record.expiresAt < new Date()) {
        await authRepository.deletePasswordResetToken(token, tx)
        throw new AppError('Token expired', 400)
      }

      if (record.usedAt) {
        throw new AppError('Token already used', 400)
      }

      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

      await userRepository.update(
        record.userId,
        { password: hashedPassword },
        tx,
      )
      await authRepository.updatePasswordResetToken(
        token,
        { usedAt: new Date() },
        tx,
      )

      // Invalidate all existing refresh tokens for the user to force logout from all devices
      await authRepository.deleteRefreshTokensByUserId(record.userId, tx)

      return record.userId
    })

    logger.info(`Password reset successfully for user ID: ${userId}`)
  }
}

export default new AuthService()
