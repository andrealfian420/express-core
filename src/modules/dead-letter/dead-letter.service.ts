// Purpose: Re-drive a dead-lettered job exactly once through the outbox, after its root cause
//   has been fixed, refusing replays whose link token is no longer usable.
// Caller: scripts/redrive-dlq.ts (operator CLI); integration tests.
// Dependencies: Prisma transactions, outbox and dead_letter_jobs tables, queue/job constants.
// Main Functions: redrive, RedriveError, RedriveResult.
// Side Effects: In one transaction INSERTs an outbox row (PENDING; the relay publishes it) and
//   stamps the dead-letter row with redriven_at, redriven_by and redrive_outbox_id. The
//   dead-letter row is kept as the audit record and is never re-driven twice.
import { Prisma } from '@prisma/client'
import prisma from '../../config/database'
import { PrismaTx } from '../../types/prisma'
import { EMAIL_JOBS, QUEUE_NAMES } from '../../jobs/config/queue.constants'

export class RedriveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RedriveError'
  }
}

export interface RedriveResult {
  deadLetterId: bigint
  outboxId: bigint
  queueName: string
  jobName: string
}

const ROUTABLE_QUEUES = new Set<string>(Object.values(QUEUE_NAMES))

const tokenOf = (payload: Prisma.JsonValue): string | null => {
  const token = (payload as { token?: unknown } | null)?.token
  return typeof token === 'string' && token.length > 0 ? token : null
}

// A replay guard returns a refusal reason, or null when the job may run again. Link emails
// are refused once their token is gone, expired or used: the user must request a new one.
const REPLAY_GUARDS: Record<
  string,
  (payload: Prisma.JsonValue, tx: PrismaTx) => Promise<string | null>
> = {
  [EMAIL_JOBS.VERIFICATION]: async (payload, tx) => {
    const token = tokenOf(payload)
    const record = token
      ? await tx.emailVerificationToken.findUnique({ where: { token } })
      : null
    if (!record) return 'the verification token no longer exists (already verified or removed)'
    if (record.expiresAt <= new Date()) return 'the verification token has expired'
    return null
  },
  [EMAIL_JOBS.RESET_PASSWORD]: async (payload, tx) => {
    const token = tokenOf(payload)
    const record = token
      ? await tx.passwordResetToken.findUnique({ where: { token } })
      : null
    if (!record) return 'the password-reset token no longer exists'
    if (record.usedAt) return 'the password-reset token was already used'
    if (record.expiresAt <= new Date()) return 'the password-reset token has expired'
    return null
  },
}

class DeadLetterService {
  async redrive(id: bigint, by: string | null = null): Promise<RedriveResult> {
    return await prisma.$transaction(async (tx: PrismaTx) => {
      const row = await tx.deadLetterJob.findUnique({ where: { id } })
      if (!row) {
        throw new RedriveError(`Dead-letter job ${id} not found`)
      }
      if (row.redrivenAt) {
        throw new RedriveError(
          `Dead-letter job ${id} was already re-driven at ${row.redrivenAt.toISOString()} (outbox ${row.redriveOutboxId})`,
        )
      }
      if (!ROUTABLE_QUEUES.has(row.queueName)) {
        throw new RedriveError(`Unknown queue "${row.queueName}"; nothing can process it`)
      }

      const refusal = await REPLAY_GUARDS[row.jobName]?.(row.payload, tx)
      if (refusal) {
        throw new RedriveError(`Refusing to re-drive ${row.jobName}: ${refusal}`)
      }

      const outbox = await tx.outbox.create({
        data: {
          queueName: row.queueName,
          jobName: row.jobName,
          payload: row.payload as Prisma.InputJsonValue,
        },
      })

      // Conditional stamp: a concurrent re-drive of the same row waits for this lock, then
      // matches nothing and rolls back its own outbox insert.
      const { count } = await tx.deadLetterJob.updateMany({
        where: { id, redrivenAt: null },
        data: { redrivenAt: new Date(), redrivenBy: by, redriveOutboxId: outbox.id },
      })
      if (count === 0) {
        throw new RedriveError(`Dead-letter job ${id} was re-driven concurrently`)
      }

      return {
        deadLetterId: row.id,
        outboxId: outbox.id,
        queueName: row.queueName,
        jobName: row.jobName,
      }
    })
  }
}

export default new DeadLetterService()
