// Purpose: Route definitions for authentication (register, login, refresh, logout, email
//   verification, password reset) with rate limiters, validation and the origin guard.
// Caller: src/routes/index.ts — mounted at /api/v1/auth before the general API limiter.
// Dependencies: auth.controller, validate, rate-limit and origin-check middleware.
// Main Functions: Express router (default export).
// Side Effects: None directly; the controller writes tokens, sets cookies and enqueues email.
import { Router } from 'express'
import validate from '../../middleware/validate.middleware'
import checkOrigin from '../../middleware/origin-check.middleware'
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

// checkOrigin guards only the cookie routes: login issues the refreshToken cookie
// (login CSRF), refresh and logout consume it (see origin-check.middleware.ts).
router.post(
  '/login',
  [checkOrigin, loginRateLimiter, validate(loginSchema)],
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
router.post('/refresh', checkOrigin, authController.refreshAccessToken)
router.get('/verify-email', authController.verifyEmail)
router.post('/logout', checkOrigin, authController.logout)

export default router
