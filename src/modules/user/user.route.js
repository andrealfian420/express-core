const express = require('express')
const userController = require('./user.controller')
const { createUserSchema, updateUserSchema } = require('./user.validation')
const validate = require('../../middleware/validate.middleware')
const authMiddleware = require('../../middleware/auth.middleware')
const checkPermission = require('../../middleware/rbac.middleware')
const { PERMISSIONS } = require('../role/role.permissions')
const router = express.Router()

router.use(authMiddleware)

router.get(
  '/',
  checkPermission(PERMISSIONS.DATA_MASTER.USER.INDEX),
  userController.index,
)

router.get(
  '/:slug',
  checkPermission(PERMISSIONS.DATA_MASTER.USER.INDEX),
  userController.show,
)

router.post(
  '/',
  [
    checkPermission(PERMISSIONS.DATA_MASTER.USER.CREATE),
    validate(createUserSchema),
  ],
  userController.store,
)

router.put(
  '/:slug',
  [
    checkPermission(PERMISSIONS.DATA_MASTER.USER.EDIT),
    validate(updateUserSchema),
  ],
  userController.update,
)

module.exports = router
