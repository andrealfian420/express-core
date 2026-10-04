// Purpose: Build absolute links under APP_URL for emails and other outbound references.
// Caller: jobs/workers/email.processor.ts.
// Dependencies: process.env.APP_URL (scheme, host and port, e.g. http://localhost:3001).
// Main Functions: appUrl.
// Side Effects: None.

/**
 * Joins APP_URL with an absolute path and URL-encoded query parameters.
 * APP_URL already carries the port, so PORT is never appended; a trailing slash on
 * APP_URL is ignored so the result never contains "//" before the path.
 */
export function appUrl(
  pathname: string,
  query: Record<string, string> = {},
): string {
  const base = (process.env.APP_URL || '').replace(/\/+$/, '')
  const search = new URLSearchParams(query).toString()
  return `${base}${pathname}${search ? `?${search}` : ''}`
}
