// Purpose: Ordered, idempotent graceful shutdown shared by the API and worker processes.
// Caller: src/server.ts, src/jobs/run-workers.ts; unit tests.
// Dependencies: A logger with info/error (Winston in production).
// Main Functions: createShutdown, installProcessHandlers, ShutdownStep.
// Side Effects: Runs the provided close steps; installs signal and fatal-error handlers on
//   `process`; forces exit(1) when shutdown exceeds its timeout. On success the process
//   exits on its own once every handle is released, so a leaked handle surfaces as a
//   forced exit instead of being hidden by an unconditional process.exit().

export interface ShutdownStep {
  name: string
  run: () => unknown | Promise<unknown>
}

interface ShutdownLogger {
  info: (message: string, meta?: Record<string, unknown>) => unknown
  error: (message: string, meta?: Record<string, unknown>) => unknown
}

export interface ShutdownOptions {
  steps: ShutdownStep[]
  timeoutMs: number
  logger: ShutdownLogger
  forceExit?: (code: number) => void
}

// Resolves with the exit code: 0 when every step succeeded, 1 otherwise (or when the
// shutdown was triggered by a fatal error). Later calls return the first run's promise.
export type Shutdown = (reason: string, fatal?: boolean) => Promise<number>

export function createShutdown({
  steps,
  timeoutMs,
  logger,
  forceExit = (code) => process.exit(code),
}: ShutdownOptions): Shutdown {
  let running: Promise<number> | null = null

  return (reason, fatal = false) => {
    if (running) return running

    running = (async () => {
      logger.info(`Shutting down (${reason})`)

      // Unref'd: it never keeps the process alive, it only fires if something else does.
      const timer = setTimeout(() => {
        logger.error(`Shutdown did not finish within ${timeoutMs} ms; forcing exit`)
        forceExit(1)
      }, timeoutMs)
      timer.unref()

      let code = fatal ? 1 : 0
      for (const step of steps) {
        try {
          await step.run()
        } catch (error) {
          code = 1
          logger.error(`Shutdown step failed: ${step.name}`, {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      logger.info(`Shutdown complete (${reason})`, { exitCode: code })
      return code
    })()

    return running
  }
}

// SIGINT/SIGTERM shut down cleanly; uncaught errors shut down with exit code 1.
export function installProcessHandlers(
  shutdown: Shutdown,
  logger: ShutdownLogger,
): void {
  const run = (reason: string, fatal = false) =>
    shutdown(reason, fatal).then((code) => {
      process.exitCode = code
    })

  process.on('SIGINT', () => run('SIGINT'))
  process.on('SIGTERM', () => run('SIGTERM'))
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    })
    run('uncaughtException', true)
  })
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    })
    run('unhandledRejection', true)
  })
}
