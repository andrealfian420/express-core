import { Router } from 'express'
import roleController from './role.controller'
import { createRoleSchema, updateRoleSchema } from './role.validation'
import validate from '../../middleware/validate.middleware'
import authMiddleware from '../../middleware/auth.middleware'
import checkPermission from '../../middleware/rbac.middleware'
import { PERMISSIONS } from './role.permissions'

const router = Router()

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

export default router
