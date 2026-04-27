import { Request, Response, NextFunction } from 'express'
import activityLogService from './activity-log.service'
import response from '../../utils/response'

// ActivityLogController handles HTTP requests related to activity logs.
class ActivityLogController {
  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await activityLogService.getActivityLogs(req)
      response(res, result, 'Activity logs retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activityLog = await activityLogService.getActivityLogById(
        parseInt(req.params.id as string, 10),
      )
      response(res, activityLog, 'Activity log retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async getUserLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await activityLogService.getActivityLogsByUserId(
        parseInt(req.params.userId as string, 10),
        req,
      )
      response(res, result, 'User activity logs retrieved successfully')
    } catch (err) {
      next(err)
    }
  }
}

export default new ActivityLogController()
