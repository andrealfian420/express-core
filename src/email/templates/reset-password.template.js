const baseTemplate = require('./layout/base.template')

function resetPasswordTemplate(data) {
  const { name, link } = data
  const html = `
    <p style="color:#374151;font-size:16px;">Hello, <strong>${name}</strong>!</p>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;">
      We received a request to reset your account password.
      Click the button below to create a new password.
    </p>
    <div style="margin:32px 0;">
      <a href="${link}"
        style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none; padding:14px 28px;border-radius:6px;font-size:15px;font-weight:bold;">
        Reset Password
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;">
      This link is valid for <strong>1 hour</strong>.<br/>
      If you did not request a password reset, please ignore this email. Your account remains safe.
    </p>
  `

  return baseTemplate(html)
}

module.exports = resetPasswordTemplate
