// Purpose: Shared queue and job names so producers, the outbox relay, workers and the
//   dead-letter re-drive always agree on routing.
// Caller: Queues, workers, email processor, auth producers, outbox relay, cron, re-drive.
// Dependencies: None.
// Main Functions: QUEUE_NAMES, EMAIL_JOBS, SYSTEM_JOBS.
// Side Effects: None.
export const QUEUE_NAMES = {
  EMAIL: 'email',
  SYSTEM: 'system',
} as const

export const EMAIL_JOBS = {
  VERIFICATION: 'sendVerificationEmail',
  VERIFICATION_SUCCESS: 'sendVerificationSuccessEmail',
  RESET_PASSWORD: 'sendResetPasswordEmail',
} as const

export const SYSTEM_JOBS = {
  CLEANUP_EXPIRED_TOKENS: 'cleanupExpiredTokens',
  CLEANUP_OUTBOX: 'cleanupOutbox',
  CLEANUP_DEAD_LETTER_JOBS: 'cleanupDeadLetterJobs',
} as const
