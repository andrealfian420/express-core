import { Request } from 'express'
import AppError from '../../utils/appError'
import activityLogRepository from './activity-log.repository'
import { ActivityLogData } from './activity-log.types'

// ActivityLogService contains business logic related to activity logs.
class ActivityLogService {
  async getActivityLogs(req: Request): Promise<any> {
    return await activityLogRepository.getActivityLogs(req)
  }

  async getActivityLogById(id: number): Promise<ActivityLogData> {
    const activityLog = await activityLogRepository.findById(id)
    if (!activityLog) {
      throw new AppError('Activity log not found', 404)
    }

    activityLog.causedAt = activityLog.createdAt.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) // format as j F Y H:i

    return activityLog
  }

  async getActivityLogsByUserId(userId: number, req: Request): Promise<any> {
    return await activityLogRepository.findByUserId(userId, req)
  }
}

export default new ActivityLogService()
