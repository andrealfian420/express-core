// Purpose: HTML body of the registration code email (REGISTRATION_VERIFICATION=otp).
// Caller: email.service (sendOtpEmail).
// Dependencies: layout/base.template, config/env (APP_NAME).
// Main Functions: otpCodeTemplate (default).
// Side Effects: None.
import baseTemplate from './layout/base.template'
import { env } from '../../config/env'

interface OtpCodeData {
  code: string
  expiresMinutes: number
}

// The greeting is generic: the recipient has no account yet.
function otpCodeTemplate(data: OtpCodeData): string {
  const { code, expiresMinutes } = data
  const html = `
    <p style="color:#374151;font-size:16px;">Hello!</p>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;">
      Use the verification code below to confirm your email address and continue your registration.
    </p>
    <div style="margin:32px 0;text-align:center;">
      <span style="display:inline-block;background:#f4f4f5;color:#111827;padding:16px 32px;border-radius:6px;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:'Courier New',Courier,monospace;">
        ${code}
      </span>
    </div>
    <p style="color:#9ca3af;font-size:13px;">
      This code is valid for <strong>${expiresMinutes} minutes</strong>.<br/>
      If you did not request this code at ${env.APP_NAME}, please ignore this email.
    </p>
  `

  return baseTemplate(html)
}

export default otpCodeTemplate
