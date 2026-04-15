const bcrypt = require('bcryptjs')
const authRepository = require('./auth.repository')
const { generateToken } = require('../../utils/token')
const prisma = require('../../config/database')
const AppError = require('../../utils/appError')
const { generateAccessToken } = require('../../utils/jwt')
const { emailQueue } = require('../../jobs')
const logger = require('../../config/logger')
const { makeUniqueSlug } = require('../../utils/sluggable')
const userRepository = require('../user/user.repository')

// This service contains the business logic for authentication-related operations.
class AuthService {
  async register(userData) {
    // Use transaction to ensure user and verification token are created atomically
    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await authRepository.findUserByEmail(
        userData.email,
        tx,
      )
      if (existingUser) {
        throw new AppError('Email already in use', 400)
      }

      const hashedPassword = await bcrypt.hash(
        userData.password,
        Number(process.env.BCRYPT_ROUNDS),
      )

      const slug = await makeUniqueSlug(userData.name, (candidate, excludeId) =>
        tx.user.findFirst({
          where: {
            slug: candidate,
            deletedAt: null,
            ...(excludeId ? { id: { not: excludeId } } : {}),
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

      const token = generateToken()

      await tx.emailVerificationToken.create({
        data: {
          token: token,
          userId: user.id,
          expiresAt: new Date(
            Date.now() + process.env.EMAIL_VERIFICATION_EXPIRES_HOURS * 3600000,
          ),
        },
      })

      return { user, token }
    })

    // Add email sending job to the queue AFTER transaction succeeds
    await emailQueue.add('sendVerificationEmail', {
      email: result.user.email,
      name: result.user.name,
      token: result.token,
    })

    logger.info(`New user registered: ${result.user.email}`)

    return result
  }

  async login(email, password) {
    const user = await authRepository.findUserByEmail(email)

    if (!user) {
      throw new AppError('Invalid email or password', 401)
    }

    if (!user.isEmailVerified) {
      throw new AppError('Email not verified', 403)
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401)
    }

    const accessToken = generateAccessToken(user)
    const refreshToken = generateToken()

    logger.info(`User ${user.email} logged in`)

    await authRepository.createRefreshToken({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(
        Date.now() + process.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000,
      ),
    })

    return { accessToken, refreshToken }
  }

  async refreshToken(token) {
    const record = await authRepository.findRefreshToken(token)

    if (!record) {
      throw new AppError('Invalid refresh token', 401)
    }

    if (record.expiresAt < new Date()) {
      await authRepository.deleteRefreshToken(token)
      throw new AppError('Refresh token expired', 401)
    }

    const accessToken = generateAccessToken({ id: record.userId })

    return { accessToken }
  }

  async logout(token) {
    await authRepository.deleteRefreshToken(token)
  }

  async verifyEmail(token) {
    // Use transaction to ensure user update and token deletion are atomic
    const user = await prisma.$transaction(async (tx) => {
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

      await tx.user.update({
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

      const updatedUser = await tx.user.findUnique({
        where: {
          id: record.userId,
        },
      })

      return updatedUser
    })

    // Send success email verification notification AFTER transaction succeeds
    await emailQueue.add('sendVerificationSuccessEmail', {
      email: user.email,
      name: user.name,
    })

    logger.info(`Email verified successfully for user: ${user.email}`)
  }

  async forgotPassword(email) {
    const user = await authRepository.findUserByEmail(email)

    if (!user) {
      throw new AppError('Email not found', 404)
    }

    const token = generateToken()

    await prisma.passwordResetToken.create({
      data: {
        token: token,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + process.env.PASSWORD_RESET_EXPIRES_MINUTES * 60000,
        ),
      },
    })

    // TODO: Send password reset email with the token

    logger.info(`Password reset token created for user: ${user.email}`)
  }

  async resetPassword(token, newPassword) {
    // Use transaction to ensure password update and token marking are atomic
    const userId = await prisma.$transaction(async (tx) => {
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

      const hashedPassword = await bcrypt.hash(
        newPassword,
        Number(process.env.BCRYPT_ROUNDS),
      )

      await userRepository.update(record.userId, { password: hashedPassword }, tx)
      await authRepository.updatePasswordResetToken(token, { usedAt: new Date() }, tx)

      return record.userId
    })

    logger.info(`Password reset successfully for user ID: ${userId}`)
  }
}

module.exports = new AuthService()
