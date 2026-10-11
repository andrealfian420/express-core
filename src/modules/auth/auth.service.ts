// Purpose: Authentication business logic: registration (email link or verified OTP, optional
//   default role), login, refresh-token rotation, logout, email verification and password
//   reset.
// Caller: auth.controller; integration tests.
// Dependencies: auth.repository, refresh-rotation, registration.settings, otp.service,
//   user.repository, outbox.repository, Prisma transactions, bcrypt, token/JWT utils,
//   cache.service, logger, config/env (token lifetimes, bcrypt cost).
// Main Functions: register, login, refreshAccessToken, logout, verifyEmail,
//   requestPasswordReset, resetPassword.
// Side Effects: Writes users and refresh/verification/reset tokens; records verification,
//   verified-notice and password-reset email intents in the outbox inside the same
//   transaction (tokens travel only in the job payload, never in HTTP responses; nothing
//   touches Redis on these request paths); logout revokes the session family in the database,
//   then invalidates the cached profile (best effort). Expired-token deletions and reuse
//   revocations commit before the request is rejected.
import bcrypt from 'bcryptjs'
import authRepository from './auth.repository'
import { generateToken, hashToken } from '../../utils/token'
import prisma from '../../config/database'
import AppError from '../../utils/appError'
import { generateAccessToken } from '../../utils/jwt'
import { rotateRefreshToken } from './refresh-rotation'
import outboxRepository from '../outbox/outbox.repository'
import { EMAIL_JOBS, QUEUE_NAMES } from '../../jobs/config/queue.constants'
import logger from '../../config/logger'
import { makeUniqueSlug } from '../../utils/sluggable'
import userRepository from '../user/user.repository'
import cacheService from '../../services/cache.service'
import { PrismaTx } from '../../types/prisma'
import { AuthTokens, RegisterData, RegisterInput } from './auth.types'
import { registrationSettings } from './registration.settings'
import otpService from '../otp/otp.service'
import { env } from '../../config/env'

const {
  BCRYPT_ROUNDS,
  REFRESH_TOKEN_EXPIRES_DAYS,
  EMAIL_VERIFICATION_EXPIRES_HOURS,
  PASSWORD_RESET_EXPIRES_MINUTES,
} = env

// This service contains the business logic for authentication-related operations.
class AuthService {
  // Link mode: unverified account + verification link email. OTP mode: the verified code is
  // consumed in the same transaction and the account starts verified (no link email).
  async register(userData: RegisterInput): Promise<RegisterData> {
    const otpMode = registrationSettings.mode() === 'otp'

    // Use transaction to ensure user and verification token are created atomically
    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const existingUser = otpMode
        ? await authRepository.findUserByEmailInsensitive(userData.email, tx)
        : await authRepository.findUserByEmail(userData.email, tx)

      if (existingUser) {
        throw new AppError('Email already in use', 400)
      }

      if (otpMode) {
        await otpService.consumeForRegistration(tx, userData.email, userData.registrationToken)
      }

      const roleId = await this.defaultRoleId(tx)

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
          roleId,
          isEmailVerified: otpMode,
        },
        tx,
      )

      const { password, ...safeUserData } = user

      if (otpMode) {
        return { user: safeUserData }
      }

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

  // REGISTRATION_DEFAULT_ROLE (slug) → role id; null when unset. A slug that matches no
  // active role is a deployment error: refuse to register rather than silently skip it.
  private async defaultRoleId(tx: PrismaTx): Promise<number | null> {
    const slug = registrationSettings.defaultRoleSlug()
    if (!slug) return null
    const roleId = await authRepository.findActiveRoleIdBySlug(slug, tx)
    if (roleId === null) {
      logger.error('REGISTRATION_DEFAULT_ROLE does not match an active role', { slug })
      throw new AppError('Registration is temporarily unavailable', 500)
    }
    return roleId
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

  // Rotation with a database grace window (see refresh-rotation): parallel or retried
  // requests with the same token all receive one successor; the successor reaches the client
  // only after the transaction commits, and Redis is not involved.
  async refreshAccessToken(token: string): Promise<AuthTokens> {
    if (!token) {
      throw new AppError('Refresh token required', 401)
    }

    const outcome = await prisma.$transaction((tx: PrismaTx) =>
      rotateRefreshToken(token, tx),
    )

    switch (outcome.kind) {
      case 'issued':
        return {
          accessToken: generateAccessToken({ id: outcome.userId }),
          refreshToken: outcome.refreshToken,
        }
      case 'expired':
        throw new AppError('Refresh token expired', 401)
      case 'reused':
        logger.warn('Refresh token reused after its grace window; session revoked', {
          userId: outcome.userId,
          familyId: outcome.familyId,
        })
        throw new AppError('Invalid refresh token', 401)
      default:
        throw new AppError('Invalid refresh token', 401)
    }
  }

  // Revokes the whole session family, so no token of it (not even a predecessor still in its
  // grace window) can refresh again. The database write comes first: a Redis failure only
  // leaves a stale profile cache entry, never a live session.
  async logout(token: string): Promise<void> {
    const record = await authRepository.findRefreshToken(hashToken(token))

    if (!record) {
      throw new AppError('Invalid refresh token', 401)
    }

    await authRepository.deleteRefreshTokenFamily(record.userId, record.familyId)

    try {
      await cacheService.del(`profile:${record.userId}`)
    } catch (err) {
      logger.warn('Could not invalidate the cached profile after logout', {
        userId: record.userId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
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
        // Returned, not thrown: the deletion must commit before the request is rejected.
        await tx.emailVerificationToken.deleteMany({
          where: {
            token: token,
          },
        })
        return null
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

    if (!user) {
      throw new AppError('Token expired', 400)
    }

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
        // Returned, not thrown: the deletion must commit before the request is rejected.
        await authRepository.deletePasswordResetToken(token, tx)
        return null
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

      // Revoke every session (rotated rows included, so no grace successor survives)
      await authRepository.deleteRefreshTokensByUserId(record.userId, tx)

      return record.userId
    })

    if (userId === null) {
      throw new AppError('Token expired', 400)
    }

    logger.info(`Password reset successfully for user ID: ${userId}`)
  }
}

export default new AuthService()
