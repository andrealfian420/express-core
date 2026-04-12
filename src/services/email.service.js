const transporter = require('../email/mailer')
const verifyEmailTemplate = require('../email/templates/verify-email.template')
const resetPasswordTemplate = require('../email/templates/reset-password.template')
const successVerifyEmailTemplate = require('../email/templates/success-verify-email.template')
const logger = require('../config/logger')

// This service contains the business logic for sending emails.
class EmailService {
  async sendVerificationEmail(to, data) {
    logger.info(`Sending verification email to: ${to}`)

    const html = verifyEmailTemplate(data)
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Verify Your Email Address',
      html,
    })
  }

  async sendResetPasswordEmail(to, data) {
    logger.info(`Sending reset password email to: ${to}`)

    const html = resetPasswordTemplate(data)
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Reset Your Password',
      html,
    })
  }

  async sendVerificationSuccessEmail(to, data) {
    logger.info(`Sending verification success email to: ${to}`)

    const html = successVerifyEmailTemplate(data)
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'Email Verified Successfully',
      html,
    })
  }
}

module.exports = new EmailService()
