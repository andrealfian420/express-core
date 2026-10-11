// Purpose: Registration OTP routes (`POST /auth/send-otp`, `POST /auth/verify-otp`), active
//   only when REGISTRATION_VERIFICATION=otp; otherwise the paths fall through to 404.
// Caller: auth.route (mounted under /api/v1/auth before the general auth limiter).
// Dependencies: otp.controller, registration.settings, validate and rate-limit middleware.
// Main Functions: Express router (default export).
// Side Effects: None directly; the controller writes OTP rows and email intents.
import { Router, Request, Response, NextFunction } from 'express'
import validate from '../../middleware/validate.middleware'
import { sendOtpRateLimiter, verifyOtpRateLimiter } from '../../middleware/rate-limit.middleware'
import { registrationSettings } from '../auth/registration.settings'
import otpController from './otp.controller'
import { sendOtpSchema, verifyOtpSchema } from './otp.validation'

// Not cookie endpoints: they neither read nor set the refresh cookie, so no origin guard.
const otpEnabled = (_req: Request, _res: Response, next: NextFunction) =>
  registrationSettings.mode() === 'otp' ? next() : next('route')

const router = Router()

router.post(
  '/send-otp',
  [otpEnabled, sendOtpRateLimiter, validate(sendOtpSchema)],
  otpController.sendCode,
)
router.post(
  '/verify-otp',
  [otpEnabled, verifyOtpRateLimiter, validate(verifyOtpSchema)],
  otpController.verifyCode,
)

export default router
