// Purpose: System maintenance and audit logging: expired-token cleanup, outbox and
//   dead-letter retention, and activity-log writes.
// Caller: system.processor (maintenance jobs); module services (logActivity).
// Dependencies: Prisma, outbox and dead-letter repositories, config/env (retention days), logger.
// Main Functions: cleanupExpiredTokens, cleanupOutbox, cleanupDeadLetterJobs, logActivity,
//   generateDefaultDescription.
// Side Effects: Deletes expired tokens and old terminal outbox / dead-letter rows (bounded
//   batches); inserts activity_logs rows.
import { Prisma } from '@prisma/client'
import prisma from '../config/database'
import logger from '../config/logger'
import { env } from '../config/env'
import { PrismaTx } from '../types/prisma'
import outboxRepository from '../modules/outbox/outbox.repository'
import deadLetterRepository from '../modules/dead-letter/dead-letter.repository'

const DAY_MS = 86_400_000

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

  // Retention: PUBLISHED rows only keep an empty payload; FAILED rows are already copied
  // to dead_letter_jobs. Pending rows are never touched.
  async cleanupOutbox(): Promise<{ published: number; failed: number }> {
    const now = Date.now()
    const published = await outboxRepository.prune(
      'PUBLISHED',
      new Date(now - env.OUTBOX_RETENTION_PUBLISHED_DAYS * DAY_MS),
    )
    const failed = await outboxRepository.prune(
      'FAILED',
      new Date(now - env.OUTBOX_RETENTION_FAILED_DAYS * DAY_MS),
    )
    logger.info('Finished outbox cleanup', { published, failed })
    return { published, failed }
  }

  // Retention: the dead-letter store is a diagnosis/re-drive buffer, not an archive.
  async cleanupDeadLetterJobs(): Promise<number> {
    const removed = await deadLetterRepository.prune(
      new Date(Date.now() - env.DLQ_RETENTION_DAYS * DAY_MS),
    )
    logger.info('Finished dead-letter cleanup', { removed })
    return removed
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
