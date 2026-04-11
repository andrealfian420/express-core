const prisma = require('../config/database')

class SystemService {
  async cleanupExpiredTokens() {
    const now = new Date()
    console.log('Starting cleanup of expired tokens...')

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

    console.log('Cleanup of expired tokens completed.')
  }
}

module.exports = new SystemService()
