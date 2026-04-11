const express = require('express')
const authController = require('./auth.controller')
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} = require('./auth.validation')
const validate = require('../../middleware/validate.middleware')
const authMiddleware = require('../../middleware/auth.middleware')
const router = express.Router()

router.post('/register', validate(registerSchema), authController.register)
router.post('/login', validate(loginSchema), authController.login)
router.post(
  '/refresh-token',
  validate(refreshTokenSchema),
  authController.refreshToken,
)
router.get('/verify-email', authController.verifyEmail)
router.post(
  '/request-password-reset',
  validate(requestPasswordResetSchema),
  authController.requestPasswordReset,
)
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword,
)

router.post('/logout', authMiddleware, authController.logout)

module.exports = router
