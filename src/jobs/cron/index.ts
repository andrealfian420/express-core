// Purpose: Register node-cron schedules that enqueue maintenance jobs on the system queue.
// Caller: src/jobs/run-workers.ts only — the worker process is the single scheduler owner; the
//   API process never imports this module (it may run as several cluster instances).
// Dependencies: node-cron, system queue (BullMQ), queue constants, logger.
// Main Functions: startCronJobs (default export), enqueueScheduled, scheduledJobOptions,
//   slotKey, SCHEDULES.
// Side Effects: Starts cron timers in the calling process; each tick adds jobs to Redis
//   (hourly token cleanup; daily outbox and dead-letter retention at midnight server time).
// Notes: Every enqueue uses a deterministic time-slot jobId (UTC), and the slot's job is kept
//   (completed or failed) for two slot lengths, so a duplicate enqueue in the same slot — a
//   second worker or a re-fired tick — collapses onto the existing job instead of running again.
import cron, { ScheduledTask } from 'node-cron'
import systemQueue from '../queues/system.queue'
import { SYSTEM_JOBS } from '../config/queue.constants'
import logger from '../../config/logger'

export type SlotUnit = 'hour' | 'day'

export interface Schedule {
  expression: string
  unit: SlotUnit
  jobs: string[]
}

export const SCHEDULES: Schedule[] = [
  {
    expression: '0 * * * *',
    unit: 'hour',
    jobs: [SYSTEM_JOBS.CLEANUP_EXPIRED_TOKENS],
  },
  {
    expression: '0 0 * * *',
    unit: 'day',
    jobs: [SYSTEM_JOBS.CLEANUP_OUTBOX, SYSTEM_JOBS.CLEANUP_DEAD_LETTER_JOBS],
  },
]

const SLOT_SECONDS: Record<SlotUnit, number> = { hour: 3_600, day: 86_400 }

// YYYY-MM-DDTHH for hourly slots, YYYY-MM-DD for daily slots (UTC, no ':' in BullMQ ids).
export function slotKey(unit: SlotUnit, at: Date = new Date()): string {
  return at.toISOString().slice(0, unit === 'hour' ? 13 : 10)
}

// Options are the THIRD argument of Queue.add(name, data, opts); the payload stays empty.
export function scheduledJobOptions(
  name: string,
  unit: SlotUnit,
  at: Date = new Date(),
) {
  const retention = { age: 2 * SLOT_SECONDS[unit] }

  return {
    jobId: `${name}-${slotKey(unit, at)}`,
    removeOnComplete: retention,
    removeOnFail: retention,
  }
}

export async function enqueueScheduled(
  schedule: Schedule,
  at: Date = new Date(),
): Promise<void> {
  for (const name of schedule.jobs) {
    await systemQueue.add(name, {}, scheduledJobOptions(name, schedule.unit, at))
  }
}

function startCronJobs(): ScheduledTask[] {
  return SCHEDULES.map((schedule) =>
    cron.schedule(schedule.expression, async () => {
      logger.info('Running scheduled jobs', { jobs: schedule.jobs })
      try {
        await enqueueScheduled(schedule)
      } catch (error) {
        // Redis unavailable: the next tick enqueues again; the slot id prevents doubles.
        logger.error('Failed to enqueue scheduled jobs', {
          jobs: schedule.jobs,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }),
  )
}

export default startCronJobs
