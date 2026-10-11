// Purpose: Turn a template (subject + inner HTML body) and variables into a sendable subject and
//   full HTML document.
// Caller: email-template.service (render).
// Dependencies: email/templates/layout/base.template.
// Main Functions: renderTemplate, substitute, escapeHtml.
// Side Effects: None.
// Notes: Values are HTML-escaped in the body (a user-chosen name cannot inject markup) and
//   collapsed to one line in the subject (no header injection). Unknown placeholders stay
//   visible rather than vanishing; edit validation rejects them before they are saved.
import baseTemplate from '../../email/templates/layout/base.template'

export type TemplateVariables = Record<string, string | number>

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function substitute(
  text: string,
  variables: TemplateVariables,
  encode: (value: string) => string = (value) => value,
): string {
  return text.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name)
      ? encode(String(variables[name]))
      : match,
  )
}

export function renderTemplate(
  template: { subject: string; body: string },
  variables: TemplateVariables,
): { subject: string; html: string } {
  return {
    subject: substitute(template.subject, variables).replace(/\s*[\r\n]+\s*/g, ' ').trim(),
    html: baseTemplate(substitute(template.body, variables, escapeHtml)),
  }
}
