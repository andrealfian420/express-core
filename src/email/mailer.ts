// Purpose: Mail transport abstraction: send one message through the configured driver (SMTP or
//   the ZeptoMail HTTP API) and classify failures as permanent (retrying cannot help) or
//   transient.
// Caller: services/email.service.ts (sendMail); run-workers.ts (validateMailConfig at startup).
// Dependencies: nodemailer, global fetch, config/env (MAIL_DRIVER, SMTP_*, ZEPTOMAIL_*,
//   APP_NAME), logger.
// Main Functions: sendMail, sendViaZeptoMail, validateMailConfig, isPermanentSmtpError,
//   isPermanentHttpStatus, PermanentMailError, ZEPTOMAIL_TIMEOUT_MS, transporter (default
//   export, the SMTP transport).
// Side Effects: Opens SMTP connections or HTTPS requests when sending; logs transport failures
//   without the message body (which can contain links, tokens and codes).
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

// API rejections of the request itself (bad key, sender or recipient) are permanent; request
// timeouts (408), rate limiting (429) and server errors are worth a retry.
export function isPermanentHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

type MailConfig = Pick<Env, 'MAIL_DRIVER'> &
  Partial<Pick<Env, 'SMTP_HOST' | 'SMTP_FROM' | 'ZEPTOMAIL_KEY' | 'ZEPTOMAIL_FROM_ADDRESS'>>

// Problems that make every send fail; the worker logs them at startup.
export function validateMailConfig(config: MailConfig = env): string[] {
  const problems: string[] = []
  if (config.MAIL_DRIVER === 'smtp') {
    if (!config.SMTP_HOST) problems.push('SMTP_HOST is not set')
    if (!config.SMTP_FROM) problems.push('SMTP_FROM is not set')
  }
  if (config.MAIL_DRIVER === 'zeptomail') {
    if (!config.ZEPTOMAIL_KEY) problems.push('ZEPTOMAIL_KEY is not set')
    if (!config.ZEPTOMAIL_FROM_ADDRESS) problems.push('ZEPTOMAIL_FROM_ADDRESS is not set')
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

// Below the worker's 60 s job lock, so a hung request fails (and is retried) instead of the job
// stalling and being re-run while the first attempt may still deliver.
export const ZEPTOMAIL_TIMEOUT_MS = 15_000

type ZeptoMailConfig = Pick<Env, 'ZEPTOMAIL_API_URL' | 'APP_NAME'> &
  Partial<Pick<Env, 'ZEPTOMAIL_KEY' | 'ZEPTOMAIL_FROM_ADDRESS' | 'ZEPTOMAIL_FROM_NAME'>>

export async function sendViaZeptoMail(
  message: MailMessage,
  config: ZeptoMailConfig = env,
): Promise<void> {
  const problems = validateMailConfig({ ...config, MAIL_DRIVER: 'zeptomail' })
  if (problems.length) {
    throw new PermanentMailError(`Mail is not configured: ${problems.join(', ')}`)
  }
  // Accept the token with or without the scheme prefix ZeptoMail shows next to it.
  const token = config.ZEPTOMAIL_KEY!.replace(/^Zoho-enczapikey\s+/i, '')

  let response: Response
  try {
    response = await fetch(config.ZEPTOMAIL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-enczapikey ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: {
          address: config.ZEPTOMAIL_FROM_ADDRESS,
          name: config.ZEPTOMAIL_FROM_NAME ?? config.APP_NAME,
        },
        to: [{ email_address: { address: message.to } }],
        subject: message.subject,
        htmlbody: message.html,
      }),
      signal: AbortSignal.timeout(ZEPTOMAIL_TIMEOUT_MS),
    })
  } catch (error) {
    // Network failure or timeout: transient, the worker retries. A timed-out request may
    // still have been accepted, so delivery stays at-least-once.
    logger.error('ZeptoMail request failed', {
      url: config.ZEPTOMAIL_API_URL,
      reason: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  if (response.ok) return

  const detail = (await response.text()).slice(0, 500)
  logger.error('ZeptoMail send failed', { status: response.status, detail })
  if (isPermanentHttpStatus(response.status)) {
    throw new PermanentMailError(`ZeptoMail rejected the message: ${response.status} ${detail}`)
  }
  throw new Error(`ZeptoMail is unavailable: ${response.status} ${detail}`)
}

const DRIVERS: Record<typeof env.MAIL_DRIVER, (message: MailMessage) => Promise<void>> = {
  smtp: sendViaSmtp,
  zeptomail: (message) => sendViaZeptoMail(message),
}

export async function sendMail(message: MailMessage): Promise<void> {
  await DRIVERS[env.MAIL_DRIVER](message)
}

export default transporter
