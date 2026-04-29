import { Router } from 'express'
import validate from '../../middleware/validate.middleware'
import authController from './auth.controller'

import {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from './auth.validation'

import {
  loginRateLimiter,
  registerRateLimiter,
  requestPasswordResetRateLimiter,
  resetPasswordRateLimiter,
  authRateLimiter,
} from '../../middleware/rate-limit.middleware'

const router = Router()

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

export default router
