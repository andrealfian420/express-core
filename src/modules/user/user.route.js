const express = require('express')
const userController = require('./user.controller')
const { createUserSchema, updateUserSchema } = require('./user.validation')
const validate = require('../../middleware/validate.middleware')
const authMiddleware = require('../../middleware/auth.middleware')
const checkPermission = require('../../middleware/rbac.middleware')
const { PERMISSIONS } = require('../role/role.permissions')
const { createUploader } = require('../../middleware/upload.middleware')
const router = express.Router()

const avatarUploader = createUploader(
  'avatars',
  ['image/jpeg', 'image/png', 'image/webp'],
  2 * 1024 * 1024,
)

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
    avatarUploader.single('avatar'),
    validate(createUserSchema),
  ],
  userController.store,
)

router.put(
  '/:slug',
  [
    checkPermission(PERMISSIONS.DATA_MASTER.USER.EDIT),
    avatarUploader.single('avatar'),
    validate(updateUserSchema),
  ],
  userController.update,
)

router.delete(
  '/:slug',
  checkPermission(PERMISSIONS.DATA_MASTER.USER.DELETE),
  userController.delete,
)

module.exports = router
