const express = require('express')
const activityLogController = require('./activity-log.controller')
const authMiddleware = require('../../middleware/auth.middleware')
const checkPermission = require('../../middleware/rbac.middleware')
const { PERMISSIONS } = require('../role/role.permissions')
const router = express.Router()

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

module.exports = router
