// Purpose: Verify email template rendering (escaping, subject safety), the editor's HTML policy,
//   edit validation against the catalog, and the per-route field policy of the global xss
//   middleware.
// Caller: Node unit runner.
// Dependencies: email-template render/sanitizer/catalog modules, xss middleware, Express +
//   Supertest (in-process app without persistence).
// Main Functions: Render, sanitizer, validation and middleware policy cases.
// Side Effects: Creates temporary in-process HTTP listeners only.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import supertest = require('supertest')
import { renderTemplate } from '../../src/modules/email-template/email-template.render'
import { sanitizeTemplateHtml } from '../../src/modules/email-template/email-template.sanitizer'
import {
  EMAIL_TEMPLATE_CATALOG,
  templateProblems,
} from '../../src/modules/email-template/email-template.catalog'
import { updateEmailTemplateSchema } from '../../src/modules/email-template/email-template.validation'
import xssMiddleware from '../../src/middleware/xss.middleware'

test('email template render: values are escaped in the body, the subject stays one line, unknown placeholders remain', () => {
  const { subject, html } = renderTemplate(
    { subject: 'Hi {{name}}\r\nBcc: x@evil.invalid', body: '<p>{{name}} {{link}} {{missing}}</p>' },
    { name: '<img src=x onerror=alert(1)> & "Ann"', link: 'https://a.invalid/?a=1&b=2' },
  )
  assert.equal(subject, 'Hi <img src=x onerror=alert(1)> & "Ann" Bcc: x@evil.invalid')
  assert.match(html, /<p>&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Ann&quot; https:\/\/a\.invalid\/\?a=1&amp;b=2 \{\{missing\}\}<\/p>/)
  assert.match(html, /<!DOCTYPE html>/)
})

test('email template sanitizer: built-in bodies survive unchanged; scripts, handlers and unsafe links go', () => {
  for (const [key, template] of Object.entries(EMAIL_TEMPLATE_CATALOG))
    assert.equal(sanitizeTemplateHtml(template.body), template.body, key)
  const cleaned = sanitizeTemplateHtml(
    '<p style="color:red" onclick="steal()">Hi</p><script>alert(1)</script>' +
      '<a href="javascript:alert(1)">x</a><a href="{{ link }}">ok</a><iframe src="//x"></iframe>',
  )
  assert.equal(cleaned, '<p style="color:red">Hi</p><a href>x</a><a href="{{ link }}">ok</a>')
})

test('email template validation: unknown variables and missing required ones are reported per field', () => {
  assert.deepEqual(templateProblems('reset-password', EMAIL_TEMPLATE_CATALOG['reset-password']), [])
  assert.deepEqual(
    templateProblems('reset-password', { subject: 'Reset {{usr}}', body: '<p>{{lnk}}</p>' }),
    [
      { field: 'subject', message: 'Unknown variable {{usr}}' },
      { field: 'body', message: 'Unknown variable {{lnk}}' },
      { field: 'body', message: 'Body must contain {{link}}' },
    ],
  )
  assert.deepEqual(templateProblems('email-verified', { subject: '{{app_name}}', body: '<p>Hi</p>' }), [])
  assert.equal(updateEmailTemplateSchema.safeParse({}).success, false)
  assert.equal(updateEmailTemplateSchema.safeParse({ body: '<script>x</script>' }).success, false)
})

test('xss middleware: only the template editor route keeps `body` for its own policy', async () => {
  const app = express()
  app.use(express.json())
  app.use(xssMiddleware)
  app.put('/api/v1/email-templates/:key', (req, res) => res.json(req.body))
  app.put('/api/v1/roles/:slug', (req, res) => res.json(req.body))
  const payload = { body: '<p onclick="x()">Hi</p>', subject: '<script>x</script>Hello' }
  const editor = await supertest(app).put('/api/v1/email-templates/verify-email').send(payload)
  // `body` is left to the route's email policy; every other field is still filtered.
  assert.deepEqual(editor.body, {
    body: payload.body,
    subject: '&lt;script&gt;x&lt;/script&gt;Hello',
  })
  const other = await supertest(app).put('/api/v1/roles/admin').send(payload)
  assert.equal(other.body.body, '<p>Hi</p>')
  const post = await supertest(app).post('/api/v1/email-templates/verify-email').send(payload)
  assert.equal(post.status, 404)
})
