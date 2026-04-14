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

  generateDefaultDescription(action, subjectType) {
    switch (action.toUpperCase()) {
      case 'CREATE':
        return `Create new data ${subjectType}`
      case 'UPDATE':
        return `Update data ${subjectType}`
      case 'DELETE':
        return `Delete data ${subjectType}`
      case 'APPROVE':
        return `Approve data ${subjectType}`
      case 'REJECT':
        return `Reject data ${subjectType}`
      default:
        return `Perform action ${action} on ${subjectType}`
    }
  }

  async logActivity(
    userId = null,
    action,
    subjectType,
    subjectId = null,
    description,
    oldData = null,
    newData = null,
  ) {
    try {
      // If description is not provided, generate a default one based on action and subjectType
      const finalDescription =
        description || this.generateDefaultDescription(action, subjectType)

      await prisma.activityLog.create({
        data: {
          userId,
          action: action.toUpperCase(),
          subjectType,
          subjectId,
          description: finalDescription,
          oldData,
          newData,
        },
      })
    } catch (error) {
      console.error('Failed to save Activity Log:', error)
    }
  }
}

module.exports = new SystemService()
