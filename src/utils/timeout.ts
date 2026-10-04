// Purpose: Bound how long the caller waits for a promise.
// Caller: jobs/relay/outbox-relay.ts (BullMQ publish); unit tests.
// Dependencies: None.
// Main Functions: withTimeout, TimeoutError.
// Side Effects: None; the timer is always cleared. The underlying operation is not cancelled.

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message = `Timed out after ${timeoutMs} ms`,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), timeoutMs)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    clearTimeout(timer)
  }
}
