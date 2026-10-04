// Purpose: Render and send transactional emails (verification, password reset, verified notice).
// Caller: jobs/workers/email.processor.ts.
// Dependencies: email/mailer (SMTP transport), email templates, logger, config/env (SMTP_FROM).
// Main Functions: sendVerificationEmail, sendResetPasswordEmail, sendVerificationSuccessEmail.
// Side Effects: Sends email through the SMTP transport.
import transporter from '../email/mailer'
import verifyEmailTemplate from '../email/templates/verify-email.template'
import resetPasswordTemplate from '../email/templates/reset-password.template'
import successVerifyEmailTemplate from '../email/templates/success-verify-email.template'
import logger from '../config/logger'
import { env } from '../config/env'

interface VerifyEmailData {
  name: string
  link: string
  token?: string
}

interface SuccessVerifyEmailData {
  name: string
}

// This service contains the business logic for sending emails.
class EmailService {
  async sendVerificationEmail(
    to: string,
    data: VerifyEmailData,
  ): Promise<void> {
    logger.info(`Sending verification email to: ${to}`)

    const html = verifyEmailTemplate(data)
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Verify Your Email Address',
      html,
    })
  }

  async sendResetPasswordEmail(
    to: string,
    data: VerifyEmailData,
  ): Promise<void> {
    logger.info(`Sending reset password email to: ${to}`)

    const html = resetPasswordTemplate(data)
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Reset Your Password',
      html,
    })
  }

  async sendVerificationSuccessEmail(
    to: string,
    data: SuccessVerifyEmailData,
  ): Promise<void> {
    logger.info(`Sending verification success email to: ${to}`)

    const html = successVerifyEmailTemplate(data)
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Email Verified Successfully',
      html,
    })
  }
}

export default new EmailService()
