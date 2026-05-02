import { Prisma } from '@prisma/client'
import prisma from '../config/database'
import logger from '../config/logger'
import { PrismaTx } from '../types/prisma'

class SystemService {
  async cleanupExpiredTokens(): Promise<void> {
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

  generateDefaultDescription(action: string, subjectType: string): string {
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
    userId: number | null = null,
    action: string,
    subjectType: string,
    subjectId: number | null = null,
    description: string | null = null,
    oldData: Prisma.InputJsonValue | null = null,
    newData: Prisma.InputJsonValue | null = null,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<void> {
    try {
      const db = txOrPrisma || prisma
      // If description is not provided, generate a default one based on action and subjectType
      const finalDescription =
        description || this.generateDefaultDescription(action, subjectType)

      await db.activityLog.create({
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

export default new SystemService()
