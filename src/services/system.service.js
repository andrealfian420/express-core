const prisma = require('../config/database')
const logger = require('../config/logger')

class SystemService {
  async cleanupExpiredTokens() {
    const now = new Date()
    logger.info('Starting cleanup of expired tokens')

    await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: now, // Delete tokens that have expired before the current time
        },
      },
    })

    await prisma.emailVerificationToken.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    })

    await prisma.passwordResetToken.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    })

    logger.info('Finished cleanup of expired tokens')
  }
}

module.exports = new SystemService()
