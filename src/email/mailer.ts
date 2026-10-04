// Purpose: Mail transport abstraction: send one message through the configured driver (SMTP
//   today) and classify failures as permanent (retrying cannot help) or transient.
// Caller: services/email.service.ts (sendMail); run-workers.ts (validateMailConfig at startup).
// Dependencies: nodemailer, config/env (MAIL_DRIVER, SMTP_*), logger.
// Main Functions: sendMail, validateMailConfig, isPermanentSmtpError, PermanentMailError,
//   transporter (default export, the SMTP transport).
// Side Effects: Opens SMTP connections when sending; logs transport failures without the
//   message body (which can contain links with tokens).
import nodemailer from 'nodemailer'
import { env, Env } from '../config/env'
import logger from '../config/logger'

export interface MailMessage {
  to: string
  subject: string
  html: string
}

// A failure that the same message can never overcome: the worker turns it into a BullMQ
// UnrecoverableError, so the job skips its remaining retries and is dead-lettered at once.
export class PermanentMailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentMailError'
  }
}

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,

  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
})

// 5xx replies and envelope errors (rejected sender/recipient) are permanent; timeouts,
// dropped connections and 4xx replies (greylisting, rate limits) are worth a retry.
export function isPermanentSmtpError(error: unknown): boolean {
  const { responseCode, code } = (error ?? {}) as {
    responseCode?: unknown
    code?: unknown
  }
  return (
    (typeof responseCode === 'number' &&
      responseCode >= 500 &&
      responseCode < 600) ||
    code === 'EENVELOPE'
  )
}

// Problems that make every send fail; the worker logs them at startup.
export function validateMailConfig(
  config: Pick<Env, 'MAIL_DRIVER' | 'SMTP_HOST' | 'SMTP_FROM'> = env,
): string[] {
  const problems: string[] = []
  if (config.MAIL_DRIVER === 'smtp') {
    if (!config.SMTP_HOST) problems.push('SMTP_HOST is not set')
    if (!config.SMTP_FROM) problems.push('SMTP_FROM is not set')
  }
  return problems
}

async function sendViaSmtp(message: MailMessage): Promise<void> {
  // Without a host Nodemailer silently falls back to localhost; misconfiguration is permanent.
  const problems = validateMailConfig()
  if (problems.length) {
    throw new PermanentMailError(`Mail is not configured: ${problems.join(', ')}`)
  }

  try {
    await transporter.sendMail({ from: env.SMTP_FROM, ...message })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('SMTP send failed', {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      reason,
    })
    if (isPermanentSmtpError(error)) {
      throw new PermanentMailError(`SMTP rejected the message: ${reason}`)
    }
    throw error
  }
}

const DRIVERS: Record<typeof env.MAIL_DRIVER, (message: MailMessage) => Promise<void>> = {
  smtp: sendViaSmtp,
}

export async function sendMail(message: MailMessage): Promise<void> {
  await DRIVERS[env.MAIL_DRIVER](message)
}

export default transporter
