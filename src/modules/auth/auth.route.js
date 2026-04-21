const express = require('express')
const authController = require('./auth.controller')
const router = express.Router()
const validate = require('../../middleware/validate.middleware')
const {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} = require('./auth.validation')
const {
  loginRateLimiter,
  registerRateLimiter,
  requestPasswordResetRateLimiter,
  resetPasswordRateLimiter,
  authRateLimiter,
} = require('../../middleware/rate-limit.middleware')

router.post(
  '/register',
  [registerRateLimiter, validate(registerSchema)],
  authController.register,
)

router.post(
  '/login',
  [loginRateLimiter, validate(loginSchema)],
  authController.login,
)

router.post(
  '/request-password-reset',
  [requestPasswordResetRateLimiter, validate(requestPasswordResetSchema)],
  authController.requestPasswordReset,
)

router.post(
  '/reset-password',
  [resetPasswordRateLimiter, validate(resetPasswordSchema)],
  authController.resetPassword,
)

router.use(authRateLimiter) // Apply general auth rate limiter to all subsequent auth routes
router.post('/refresh', authController.refreshAccessToken)
router.get('/verify-email', authController.verifyEmail)
router.post('/logout', authController.logout)

module.exports = router
