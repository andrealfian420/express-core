const activityLogService = require('./activity-log.service')
const response = require('../../utils/response')

// ActivityLogController handles HTTP requests related to activity logs.
class ActivityLogController {
  async index(req, res, next) {
    try {
      const result = await activityLogService.getActivityLogs(req)
      response(res, result, 'Activity logs retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async show(req, res, next) {
    try {
      const activityLog = await activityLogService.getActivityLogById(
        parseInt(req.params.id),
      )
      response(res, activityLog, 'Activity log retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async getUserLogs(req, res, next) {
    try {
      const result = await activityLogService.getActivityLogsByUserId(
        parseInt(req.params.userId),
        req,
      )
      response(res, result, 'User activity logs retrieved successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new ActivityLogController()
