// Purpose: CSRF defense in depth for the only endpoints that use an ambient browser credential
//   (the `refreshToken` cookie): reject state-changing requests whose Origin, or Referer when
//   Origin is absent, is not in ALLOWED_ORIGINS. Every other route is Bearer-only and therefore
//   not exposed to CSRF, so this guard must NOT be mounted globally.
// Caller: auth.route.ts — POST /auth/login, /auth/refresh, /auth/logout.
// Dependencies: config/origins (shared allowlist with CORS), AppError, logger.
// Main Functions: checkOrigin (default export).
// Side Effects: None besides a warning log entry for each rejected request.
import { Request, Response, NextFunction } from 'express'
import AppError from '../utils/appError'
import logger from '../config/logger'
import { isAllowedOrigin } from '../config/origins'

// Methods that cannot change state are never blocked (this also keeps CORS preflight working).
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Origin (scheme://host[:port]) of a Referer URL, or null when it cannot be parsed.
function originFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

/**
 * Origin/Referer allowlist guard for cookie-authenticated, state-changing routes.
 *
 * The refresh cookie is `SameSite=lax`, which blocks cross-site POSTs but treats sibling
 * subdomains as same-site; this guard closes that gap and keeps protecting the cookie if it
 * is ever switched to `SameSite=none`. An Origin header takes precedence over Referer; a
 * present but unparseable value (including "null") counts as foreign, never as absent.
 *
 * A request with neither header is allowed on purpose: server-to-server callers (BFF proxy,
 * mobile clients, curl) send neither, and without a browser context there is no ambient
 * cookie to abuse. This mirrors the `!origin -> allow` rule in config/cors.ts.
 */
const checkOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  const originHeader = req.headers.origin
  const refererHeader = req.headers.referer

  if (!originHeader && !refererHeader) {
    return next()
  }

  const origin = originHeader
    ? originHeader
    : originFromReferer(refererHeader as string)

  if (origin && isAllowedOrigin(origin)) {
    return next()
  }

  logger.warn('Blocked cross-origin request to a cookie endpoint', {
    method: req.method,
    endpoint: req.originalUrl,
    origin: originHeader ?? null,
    referer: refererHeader ?? null,
  })

  return next(new AppError('Request origin not allowed', 403))
}

export default checkOrigin
