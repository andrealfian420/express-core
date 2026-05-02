import { ActivityLog } from '@prisma/client'

export type ActivityLogData = ActivityLog & {
  causedAt?: string
}
