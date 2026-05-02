import { Router } from 'express'
import userController from './user.controller'
import { createUserSchema, updateUserSchema } from './user.validation'
import validate from '../../middleware/validate.middleware'
import authMiddleware from '../../middleware/auth.middleware'
import checkPermission from '../../middleware/rbac.middleware'
import { PERMISSIONS } from '../role/role.permissions'
import { createUploader } from '../../middleware/upload.middleware'

const router = Router()

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

export default router
