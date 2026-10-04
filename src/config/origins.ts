// Purpose: Parse the ALLOWED_ORIGINS allowlist once so CORS and the origin guard never diverge.
// Caller: config/cors.ts, middleware/origin-check.middleware.ts.
// Dependencies: config/env (ALLOWED_ORIGINS, validated as exact scheme://host[:port] origins).
// Main Functions: allowedOrigins, isAllowedOrigin.
// Side Effects: None.
import { env } from './env'

export const allowedOrigins: readonly string[] = env.ALLOWED_ORIGINS

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.includes(origin)
}
