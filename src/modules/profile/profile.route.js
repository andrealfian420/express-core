const express = require('express')
const profileController = require('./profile.controller')
const authMiddleware = require('../../middleware/auth.middleware')
const validate = require('../../middleware/validate.middleware')
const { updateProfileSchema } = require('./profile.validation')
const router = express.Router()
const { createUploader } = require('../../middleware/upload.middleware')

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

module.exports = router
