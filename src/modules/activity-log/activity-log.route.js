const express = require('express')
const activityLogController = require('./activity-log.controller')
const authMiddleware = require('../../middleware/auth.middleware')
const checkPermission = require('../../middleware/rbac.middleware')
const { PERMISSIONS } = require('../role/role.permissions')
const router = express.Router()

router.use(authMiddleware)

router.get(
  '/',
  checkPermission(PERMISSIONS.LOG_ACTIVITY.INDEX),
  activityLogController.index,
)

router.get(
  '/:id',
  checkPermission(PERMISSIONS.LOG_ACTIVITY.DETAIL),
  activityLogController.show,
)

router.get(
  '/user/:userId',
  checkPermission(PERMISSIONS.LOG_ACTIVITY.INDEX),
  activityLogController.getUserLogs,
)

module.exports = router
