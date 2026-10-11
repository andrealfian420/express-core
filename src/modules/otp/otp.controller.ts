// Purpose: HTTP layer for the registration OTP endpoints.
// Caller: otp.route.
// Dependencies: otp.service, response util, config/env (OTP_VERIFIED_WINDOW_MINUTES).
// Main Functions: sendCode, verifyCode.
// Side Effects: Sends HTTP responses; the code itself is never returned.
import { Request, Response, NextFunction } from 'express'
import otpService from './otp.service'
import response from '../../utils/response'
import { env } from '../../config/env'

class OtpController {
  async sendCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await otpService.sendCode(req.body.email as string)
      response(res, null, 'Verification code sent to your email')
    } catch (err) {
      next(err)
    }
  }

  async verifyCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registrationToken = await otpService.verifyCode(
        req.body.email as string,
        req.body.code as string,
      )
      response(
        res,
        { registrationToken },
        `Email verified. Complete your registration within ${env.OTP_VERIFIED_WINDOW_MINUTES} minutes.`,
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new OtpController()
