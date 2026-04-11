const baseTemplate = require('./layout/base.template')

function successVerifyEmailTemplate(data) {
  const { name } = data
  const html = `
    <p style="color:#374151;font-size:16px;">Hello, <strong>${name}</strong>!</p>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;">
      Your email address has been successfully verified. You can now log in to your account and start using our services.
    </p>
    <p style="color:#9ca3af;font-size:13px;">
      If you did not perform this action, please contact our support team immediately.
    </p>
  `

  return baseTemplate(html)
}

module.exports = successVerifyEmailTemplate
