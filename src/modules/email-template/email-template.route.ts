// Purpose: Email template editor routes: GET /, GET /:key, PUT /:key (templates are created by
//   the seeder only; keys are fixed in code).
// Caller: src/routes/index.ts (mounted at /api/v1/email-templates).
// Dependencies: email-template.controller, validation, auth + RBAC middleware, permissions.
// Main Functions: Express router (default export).
// Side Effects: None directly; the controller reads and updates templates.
import { Router } from 'express'
import authMiddleware from '../../middleware/auth.middleware'
import checkPermission from '../../middleware/rbac.middleware'
import validate from '../../middleware/validate.middleware'
import { PERMISSIONS } from '../role/role.permissions'
import emailTemplateController from './email-template.controller'
import { updateEmailTemplateSchema } from './email-template.validation'

const router = Router()

router.use(authMiddleware)

router.get(
  '/',
  checkPermission(PERMISSIONS.DATA_MASTER.EMAIL_TEMPLATE.INDEX),
  emailTemplateController.index,
)
router.get(
  '/:key',
  checkPermission(PERMISSIONS.DATA_MASTER.EMAIL_TEMPLATE.INDEX),
  emailTemplateController.show,
)
router.put(
  '/:key',
  checkPermission(PERMISSIONS.DATA_MASTER.EMAIL_TEMPLATE.EDIT),
  validate(updateEmailTemplateSchema),
  emailTemplateController.update,
)

export default router
