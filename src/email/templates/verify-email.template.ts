import baseTemplate from './layout/base.template'

interface VerifyEmailData {
  name: string
  link: string
}

function verifyEmailTemplate(data: VerifyEmailData): string {
  const { name, link } = data
  const html = `
    <p style="color:#374151;font-size:16px;">Hello, <strong>${name}</strong>!</p>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;">
      Thank you for registering. Click the button below to verify your email address
      and activate your account.
    </p>
    <div style="margin:32px 0;">
      <a href="${link}"
        style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none; padding:14px 28px;border-radius:6px;font-size:15px;font-weight:bold;">
        Verify Email
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;">
      This link is valid for <strong>24 hours</strong>.<br/>
      If you did not register at ${process.env.APP_NAME || 'App'}, please ignore this email.
    </p>
  `

  return baseTemplate(html)
}

export default verifyEmailTemplate
