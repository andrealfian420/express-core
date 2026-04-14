const AppError = require('../../utils/appError')
const activityLogRepository = require('./activity-log.repository')

// ActivityLogService contains business logic related to activity logs.
class ActivityLogService {
  async getActivityLogs(req) {
    return await activityLogRepository.paginate(req)
  }

  async getActivityLogById(id) {
    const activityLog = await activityLogRepository.findById(id)
    if (!activityLog) {
      throw new AppError('Activity log not found', 404)
    }
    return activityLog
  }

  async getActivityLogsByUserId(userId, req) {
    return await activityLogRepository.findByUserId(userId, req)
  }
}

module.exports = new ActivityLogService()
