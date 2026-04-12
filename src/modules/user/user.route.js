const express = require('express')
const userController = require('./user.controller')
const { createUserSchema } = require('./user.validation')
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

router.post(
  '/',
  [
    checkPermission(PERMISSIONS.DATA_MASTER.USER.CREATE),
    validate(createUserSchema),
  ],
  userController.store,
)

module.exports = router
