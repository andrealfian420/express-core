import { Router } from 'express'
import activityLogController from './activity-log.controller'
import authMiddleware from '../../middleware/auth.middleware'
import checkPermission from '../../middleware/rbac.middleware'
import { PERMISSIONS } from '../role/role.permissions'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  checkPermission(PERMISSIONS.ACTIVITY_LOG.INDEX),
  activityLogController.index,
)

router.get(
  '/:id',
  checkPermission(PERMISSIONS.ACTIVITY_LOG.DETAIL),
  activityLogController.show,
)

router.get(
  '/user/:userId',
  checkPermission(PERMISSIONS.ACTIVITY_LOG.INDEX),
  activityLogController.getUserLogs,
)

export default router
