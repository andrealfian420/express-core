// Purpose: The fixed set of editable transactional emails: key, default subject/body (the
//   built-in text, also used as fallback and as seed data), allowed and required variables.
// Caller: email-template.service (render fallback, edit validation, responses), email.service
//   (keys), seeders/email-template.seeder, tests.
// Dependencies: None.
// Main Functions: EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_CATALOG, isTemplateKey, templateProblems,
//   GLOBAL_TEMPLATE_VARIABLES, EmailTemplateKey, TemplateDefinition.
// Side Effects: None.
// Notes: Bodies are inner HTML; the shared layout is added at send time. Tags are written in
//   the canonical form the edit sanitizer produces, so saving a default unchanged keeps it
//   byte-identical. {{placeholders}} are substituted with HTML-escaped values.

export const EMAIL_TEMPLATE_KEYS = {
  VERIFY_EMAIL: 'verify-email',
  EMAIL_VERIFIED: 'email-verified',
  RESET_PASSWORD: 'reset-password',
  REGISTRATION_CODE: 'registration-code',
} as const

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[keyof typeof EMAIL_TEMPLATE_KEYS]

export interface TemplateVariable {
  name: string
  description: string
}

export interface TemplateDefinition {
  title: string
  subject: string
  body: string
  variables: TemplateVariable[]
  required: string[]
}

// Available in every template.
export const GLOBAL_TEMPLATE_VARIABLES: TemplateVariable[] = [
  { name: 'app_name', description: 'Application name (APP_NAME)' },
]

const BUTTON =
  'display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:bold;'
const GREETING = 'color:#374151;font-size:16px;'
const TEXT = 'color:#6b7280;font-size:15px;line-height:1.6;'
const NOTE = 'color:#9ca3af;font-size:13px;'

export const EMAIL_TEMPLATE_CATALOG: Record<EmailTemplateKey, TemplateDefinition> = {
  'verify-email': {
    title: 'Email verification link',
    subject: 'Verify Your Email Address',
    body: [
      `<p style="${GREETING}">Hello, <strong>{{name}}</strong>!</p>`,
      `<p style="${TEXT}">Thank you for registering. Click the button below to verify your email address and activate your account.</p>`,
      `<div style="margin:32px 0;"><a href="{{link}}" style="${BUTTON}">Verify Email</a></div>`,
      `<p style="${NOTE}">This link is valid for <strong>{{expires_hours}} hours</strong>.<br />If you did not register at {{app_name}}, please ignore this email.</p>`,
    ].join('\n'),
    variables: [
      { name: 'name', description: 'Recipient name' },
      { name: 'link', description: 'Verification link' },
      { name: 'expires_hours', description: 'Hours the link stays valid' },
    ],
    required: ['link'],
  },
  'email-verified': {
    title: 'Email verified notice',
    subject: 'Email Verified Successfully',
    body: [
      `<p style="${GREETING}">Hello, <strong>{{name}}</strong>!</p>`,
      `<p style="${TEXT}">Your email address has been successfully verified. You can now log in to your account and start using our services.</p>`,
      `<p style="${NOTE}">If you did not perform this action, please contact our support team immediately.</p>`,
    ].join('\n'),
    variables: [{ name: 'name', description: 'Recipient name' }],
    required: [],
  },
  'reset-password': {
    title: 'Password reset link',
    subject: 'Reset Your Password',
    body: [
      `<p style="${GREETING}">Hello, <strong>{{name}}</strong>!</p>`,
      `<p style="${TEXT}">We received a request to reset your account password. Click the button below to create a new password.</p>`,
      `<div style="margin:32px 0;"><a href="{{link}}" style="${BUTTON}">Reset Password</a></div>`,
      `<p style="${NOTE}">This link is valid for <strong>{{expires_minutes}} minutes</strong>.<br />If you did not request a password reset, please ignore this email. Your account remains safe.</p>`,
    ].join('\n'),
    variables: [
      { name: 'name', description: 'Recipient name' },
      { name: 'link', description: 'Password reset link' },
      { name: 'expires_minutes', description: 'Minutes the link stays valid' },
    ],
    required: ['link'],
  },
  'registration-code': {
    title: 'Registration code',
    subject: 'Your Verification Code',
    body: [
      `<p style="${GREETING}">Hello!</p>`,
      `<p style="${TEXT}">Use the verification code below to confirm your email address and continue your registration.</p>`,
      `<div style="margin:32px 0;text-align:center;"><span style="display:inline-block;background:#f4f4f5;color:#111827;padding:16px 32px;border-radius:6px;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:'Courier New',Courier,monospace;">{{code}}</span></div>`,
      `<p style="${NOTE}">This code is valid for <strong>{{expires_minutes}} minutes</strong>.<br />If you did not request this code at {{app_name}}, please ignore this email.</p>`,
    ].join('\n'),
    variables: [
      { name: 'code', description: 'Six-digit registration code' },
      { name: 'expires_minutes', description: 'Minutes the code stays valid' },
    ],
    required: ['code'],
  },
}

export function isTemplateKey(key: string): key is EmailTemplateKey {
  return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATE_CATALOG, key)
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))]
}

// Problems that would make a saved template send a broken email: an unknown variable (a typo
// would reach recipients verbatim) or a missing required one (no link or code to act on).
export function templateProblems(
  key: EmailTemplateKey,
  template: { subject: string; body: string },
): { field: string; message: string }[] {
  const definition = EMAIL_TEMPLATE_CATALOG[key]
  const allowed = new Set(
    [...definition.variables, ...GLOBAL_TEMPLATE_VARIABLES].map((variable) => variable.name),
  )
  const problems: { field: string; message: string }[] = []
  for (const field of ['subject', 'body'] as const) {
    for (const name of placeholdersIn(template[field]))
      if (!allowed.has(name)) problems.push({ field, message: `Unknown variable {{${name}}}` })
  }
  const inBody = new Set(placeholdersIn(template.body))
  for (const name of definition.required)
    if (!inBody.has(name)) problems.push({ field: 'body', message: `Body must contain {{${name}}}` })
  return problems
}
