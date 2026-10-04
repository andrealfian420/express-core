// Purpose: Build absolute links under APP_URL for emails and other outbound references.
// Caller: jobs/workers/email.processor.ts.
// Dependencies: config/env (APP_URL: scheme, host and port, e.g. http://localhost:3001).
// Main Functions: appUrl, withQuery.
// Side Effects: None.
import { env } from '../config/env'

/**
 * Joins APP_URL with an absolute path and URL-encoded query parameters.
 * APP_URL already carries the port, so PORT is never appended; a trailing slash on
 * APP_URL is ignored so the result never contains "//" before the path.
 */
export function appUrl(
  pathname: string,
  query: Record<string, string> = {},
  baseUrl: string = env.APP_URL,
): string {
  const base = baseUrl.replace(/\/+$/, '')
  const search = new URLSearchParams(query).toString()
  return `${base}${pathname}${search ? `?${search}` : ''}`
}

/**
 * Adds (or replaces) query parameters on an absolute URL such as PASSWORD_RESET_URL,
 * keeping its path, existing parameters and fragment intact.
 */
export function withQuery(
  baseUrl: string,
  query: Record<string, string>,
): string {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}
