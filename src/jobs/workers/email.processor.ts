// Purpose: Process email jobs (verification, verification success, password reset) without
//   starting a BullMQ worker, so the processor can be exercised directly.
// Caller: email.worker.ts (BullMQ worker); integration tests.
// Dependencies: email.service (templates + mail transport), utils/url (appUrl), AppError,
//   BullMQ UnrecoverableError.
// Main Functions: processEmailJob, EmailJobData.
// Side Effects: Sends email through the configured transport.
import { Job, UnrecoverableError } from 'bullmq'
import emailService from '../../services/email.service'
import AppError from '../../utils/appError'
import { appUrl } from '../../utils/url'

export interface EmailJobData {
  email: string
  name: string
  token?: string
}

// A link job without its token can never succeed: fail it permanently instead of
// retrying or mailing a link that cannot work.
function requireToken(job: Job<EmailJobData>): string {
  if (!job.data.token) {
    throw new UnrecoverableError(`Missing token for ${job.name} job ${job.id}`)
  }

  return job.data.token
}

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  switch (job.name) {
    case 'sendVerificationEmail': {
      const token = requireToken(job)
      await emailService.sendVerificationEmail(job.data.email, {
        name: job.data.name,
        token,
        link: appUrl('/api/v1/auth/verify-email', { token }),
      })
      break
    }
    case 'sendResetPasswordEmail': {
      const token = requireToken(job)
      await emailService.sendResetPasswordEmail(job.data.email, {
        name: job.data.name,
        token,
        link: appUrl('/api/v1/auth/reset-password', { token }),
      })
      break
    }
    case 'sendVerificationSuccessEmail':
      await emailService.sendVerificationSuccessEmail(job.data.email, {
        name: job.data.name,
      })
      break
    default:
      throw new AppError(`Unknown job name: ${job.name}`, 500)
  }
}
