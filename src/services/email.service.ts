// Purpose: Render and send transactional emails (verification link, verified notice, password
//   reset, registration code) from the editable templates.
// Caller: jobs/workers/email.processor.ts.
// Dependencies: email-template.service (database text or built-in fallback), email/mailer
//   (sendMail: configured transport + failure classification), config/env (link lifetimes),
//   logger.
// Main Functions: sendVerificationEmail, sendResetPasswordEmail, sendVerificationSuccessEmail,
//   sendOtpEmail.
// Side Effects: Reads email_templates; sends email through the configured mail transport.
import { sendMail } from '../email/mailer'
import emailTemplateService from '../modules/email-template/email-template.service'
import {
  EMAIL_TEMPLATE_KEYS,
  EmailTemplateKey,
} from '../modules/email-template/email-template.catalog'
import { TemplateVariables } from '../modules/email-template/email-template.render'
import { env } from '../config/env'
import logger from '../config/logger'

interface LinkEmailData {
  name: string
  link: string
}

interface OtpEmailData {
  code: string
  expiresMinutes: number
}

async function send(to: string, key: EmailTemplateKey, variables: TemplateVariables) {
  const { subject, html } = await emailTemplateService.render(key, variables)
  await sendMail({ to, subject, html })
}

// This service contains the business logic for sending emails.
class EmailService {
  async sendVerificationEmail(to: string, data: LinkEmailData): Promise<void> {
    logger.info(`Sending verification email to: ${to}`)
    await send(to, EMAIL_TEMPLATE_KEYS.VERIFY_EMAIL, {
      name: data.name,
      link: data.link,
      expires_hours: env.EMAIL_VERIFICATION_EXPIRES_HOURS,
    })
  }

  async sendResetPasswordEmail(to: string, data: LinkEmailData): Promise<void> {
    logger.info(`Sending reset password email to: ${to}`)
    await send(to, EMAIL_TEMPLATE_KEYS.RESET_PASSWORD, {
      name: data.name,
      link: data.link,
      expires_minutes: env.PASSWORD_RESET_EXPIRES_MINUTES,
    })
  }

  async sendVerificationSuccessEmail(to: string, data: { name: string }): Promise<void> {
    logger.info(`Sending verification success email to: ${to}`)
    await send(to, EMAIL_TEMPLATE_KEYS.EMAIL_VERIFIED, { name: data.name })
  }

  async sendOtpEmail(to: string, data: OtpEmailData): Promise<void> {
    logger.info(`Sending registration code email to: ${to}`) // never log the code
    await send(to, EMAIL_TEMPLATE_KEYS.REGISTRATION_CODE, {
      code: data.code,
      expires_minutes: data.expiresMinutes,
    })
  }
}

export default new EmailService()
