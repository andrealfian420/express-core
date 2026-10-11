// Purpose: Strip HTML from every string in the request (body, query, params, cookies) before
//   routing, with a per-route exception for fields that a route filters with its own policy.
// Caller: src/app.ts (global middleware).
// Dependencies: xss (js-xss default allowlist).
// Main Functions: xssMiddleware (default export), ROUTE_FIELD_POLICIES.
// Side Effects: Mutates req.body/query/params/cookies in place.
// Notes: Never exempt a field for every route. A route that must accept HTML lists its method,
//   path and fields here and sanitizes them itself (the email template editor applies its
//   email allowlist in email-template.validation).
import { Request, Response, NextFunction } from 'express'
import xss from 'xss'

export const ROUTE_FIELD_POLICIES: { method: string; path: RegExp; fields: string[] }[] = [
  { method: 'PUT', path: /^\/api\/v1\/email-templates\/[^/]+\/?$/, fields: ['body'] },
]

function routeOwnedFields(req: Request): string[] {
  return ROUTE_FIELD_POLICIES.filter(
    (policy) => policy.method === req.method && policy.path.test(req.path),
  ).flatMap((policy) => policy.fields)
}

const sanitizeInput = (obj: any): any => {
  try {
    if (typeof obj !== 'object' || obj === null) {
      if (typeof obj === 'string') {
        return xss(obj)
      } else {
        return obj
      }
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = sanitizeInput(obj[key])
      }
    }
    return obj
  } catch (err: any) {
    console.error(`Error sanitizing object: ${err}`)
    return obj // or return an empty object, depending on your requirements
  }
}

const xssMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize all parts of the request except `markdown` (pre-existing exemption) and the
  // fields a route sanitizes itself
  const skipped = ['markdown', ...routeOwnedFields(req)].filter(
    (field) => req.body && typeof req.body === 'object' && field in req.body,
  )
  if (skipped.length > 0) {
    const kept = Object.fromEntries(skipped.map((field) => [field, req.body[field]]))
    for (const field of skipped) delete req.body[field]
    sanitizeInput(req.body)
    Object.assign(req.body, kept)
  } else {
    req.body = sanitizeInput(req.body)
  }

  if (req.query) {
    sanitizeInput(req.query)
  }
  if (req.params) {
    sanitizeInput(req.params)
  }
  if (req.cookies) {
    sanitizeInput(req.cookies)
  }
  if (req.url) {
    sanitizeInput(req.url)
  }

  // Sanitize responses
  res.locals.safeOutput = sanitizeInput(res.locals.safeOutput)

  next()
}

export default xssMiddleware
