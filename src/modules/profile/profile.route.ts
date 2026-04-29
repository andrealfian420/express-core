import { Router } from 'express'
import profileController from './profile.controller'
import authMiddleware from '../../middleware/auth.middleware'
import validate from '../../middleware/validate.middleware'
import { updateProfileSchema } from './profile.validation'
import { createUploader } from '../../middleware/upload.middleware'

const router = Router()
const avatarUploader = createUploader(
  'avatars',
  ['image/jpeg', 'image/png', 'image/webp'],
  2 * 1024 * 1024,
)

router.get('/', authMiddleware, profileController.getProfile)
router.put(
  '/',
  authMiddleware,
  avatarUploader.single('avatar'),
  validate(updateProfileSchema),
  profileController.updateProfile,
)

export default router
