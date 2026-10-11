// Purpose: Role routes: authenticated catalogues for the role editor (permission tree, user
//   types) and permission-gated role CRUD.
// Caller: src/routes/index.ts (mounted at /api/v1/roles).
// Dependencies: role.controller, role.validation, auth/rbac/validate middleware, role.permissions.
// Main Functions: Router (default export).
// Side Effects: None at definition; handlers read/write roles through role.service.
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
router.get('/user-types', roleController.userTypes)

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
