const express = require('express')
const authController = require('./auth.controller')
const {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} = require('./auth.validation')
const validate = require('../../middleware/validate.middleware')
const router = express.Router()

router.post('/register', validate(registerSchema), authController.register)
router.post('/login', validate(loginSchema), authController.login)
router.post('/refresh', authController.refreshAccessToken)
router.get('/verify-email', authController.verifyEmail)
router.post('/logout', authController.logout)

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

module.exports = router
