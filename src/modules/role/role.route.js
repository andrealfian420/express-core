const express = require('express')
const roleController = require('./role.controller')
const { createRoleSchema, updateRoleSchema } = require('./role.validation')
const validate = require('../../middleware/validate.middleware')
const authMiddleware = require('../../middleware/auth.middleware')
const checkPermission = require('../../middleware/rbac.middleware')
const { PERMISSIONS } = require('./role.permissions')

const router = express.Router()

router.use(authMiddleware)

router.get('/access-list', roleController.accessList)

router.get(
  '/',
  checkPermission(PERMISSIONS.DATA_MASTER.ROLE.INDEX),
  roleController.index,
)

router.get(
  '/:slug',
  checkPermission(PERMISSIONS.DATA_MASTER.ROLE.INDEX),
  roleController.show,
)

router.post(
  '/',
  checkPermission(PERMISSIONS.DATA_MASTER.ROLE.CREATE),
  validate(createRoleSchema),
  roleController.store,
)

router.put(
  '/:slug',
  checkPermission(PERMISSIONS.DATA_MASTER.ROLE.EDIT),
  validate(updateRoleSchema),
  roleController.update,
)

router.delete(
  '/:slug',
  checkPermission(PERMISSIONS.DATA_MASTER.ROLE.DELETE),
  roleController.destroy,
)

module.exports = router
