// Purpose: Parse the ALLOWED_ORIGINS allowlist once so CORS and the origin guard never diverge.
// Caller: config/cors.ts, middleware/origin-check.middleware.ts.
// Dependencies: dotenv, process.env.ALLOWED_ORIGINS (comma-separated scheme://host[:port] values).
// Main Functions: allowedOrigins, isAllowedOrigin.
// Side Effects: None; the list is parsed once at import time.
import 'dotenv/config'

export const allowedOrigins: readonly string[] = (
  process.env.ALLOWED_ORIGINS || ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.includes(origin)
}
