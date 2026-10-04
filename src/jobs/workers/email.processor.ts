// Purpose: Process email jobs (verification, verification success, password reset) without
//   starting a BullMQ worker, so the processor can be exercised directly.
// Caller: email.worker.ts (BullMQ worker); integration tests.
// Dependencies: email.service, mailer (PermanentMailError), cache.service (sent markers),
//   utils/url, config/env (PASSWORD_RESET_URL), logger, BullMQ UnrecoverableError.
// Main Functions: processEmailJob, EmailJobData, SENT_MARKER_TTL_SECONDS.
// Side Effects: Sends email through the configured transport; writes the Redis marker
//   `email:sent:<jobId>` after a confirmed send.
// Notes: Delivery is at-least-once. The marker stops retries, stalled re-runs and outbox
//   re-publishes of the same job id (`outbox-<id>`) from sending twice; a crash between the
//   send and the marker write can still repeat one email.
import { Job, UnrecoverableError } from 'bullmq'
import emailService from '../../services/email.service'
import cacheService from '../../services/cache.service'
import { PermanentMailError } from '../../email/mailer'
import { appUrl, withQuery } from '../../utils/url'
import { env } from '../../config/env'
import logger from '../../config/logger'
import { EMAIL_JOBS } from '../config/queue.constants'

export interface EmailJobData {
  email: string
  name: string
  token?: string
}

// Longer than any replay window: BullMQ retries, stalled recovery and relay re-publishing
// after an expired lease (publish attempts × capped backoff) all finish well within a day.
export const SENT_MARKER_TTL_SECONDS = 86_400

// A link job without its token can never succeed: fail it permanently instead of
// retrying or mailing a link that cannot work.
function requireToken(job: Job<EmailJobData>): string {
  if (!job.data.token) {
    throw new UnrecoverableError(`Missing token for ${job.name} job ${job.id}`)
  }

  return job.data.token
}

async function dispatch(job: Job<EmailJobData>): Promise<void> {
  switch (job.name) {
    case EMAIL_JOBS.VERIFICATION: {
      const token = requireToken(job)
      await emailService.sendVerificationEmail(job.data.email, {
        name: job.data.name,
        token,
        link: appUrl('/api/v1/auth/verify-email', { token }),
      })
      break
    }
    case EMAIL_JOBS.RESET_PASSWORD: {
      const token = requireToken(job)
      await emailService.sendResetPasswordEmail(job.data.email, {
        name: job.data.name,
        token,
        link: withQuery(env.PASSWORD_RESET_URL, { token }),
      })
      break
    }
    case EMAIL_JOBS.VERIFICATION_SUCCESS:
      await emailService.sendVerificationSuccessEmail(job.data.email, {
        name: job.data.name,
      })
      break
    default:
      // Retrying can never teach the processor a new job name.
      throw new UnrecoverableError(`Unknown job name: ${job.name}`)
  }
}

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const marker = job.id ? `email:sent:${job.id}` : null
  if (marker && (await cacheService.get<boolean>(marker))) {
    logger.info('Skipping an email job that was already sent', {
      job: job.name,
      jobId: job.id,
    })
    return
  }

  try {
    await dispatch(job)
  } catch (error) {
    if (error instanceof PermanentMailError) {
      throw new UnrecoverableError(error.message)
    }
    throw error
  }

  if (marker) {
    await cacheService.set(marker, true, SENT_MARKER_TTL_SECONDS)
  }
}
