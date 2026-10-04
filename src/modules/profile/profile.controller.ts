// Purpose: HTTP layer for the authenticated user's own profile.
// Caller: profile.route (GET/PUT /api/v1/profile) after authMiddleware.
// Dependencies: profile.service, response util, user.serializer, config/env (cookie settings).
// Main Functions: getProfile, updateProfile.
// Side Effects: Sends HTTP responses through toUserResponse; clears the refresh-token
//   cookie when the password changes.
import { Request, Response, NextFunction } from 'express'
import profileService from './profile.service'
import response from '../../utils/response'
import { toUserResponse } from '../user/user.serializer'
import { env } from '../../config/env'

const REFRESH_TOKEN_EXPIRES_DAYS = env.REFRESH_TOKEN_EXPIRES_DAYS

class ProfileController {
  async getProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const profile = await profileService.getProfile(req.user?.sub as number)
      response(res, toUserResponse(profile), 'Profile retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const avatar = req.file ? req.file.filename : undefined
      const updatedProfile = await profileService.updateProfile(req.user?.sub as number, {
        ...req.body,
        avatar,
      })

      // invalidate refresh tokens to force logout from all devices if password is changed
      if (req.body.password) {
        res.clearCookie('refreshToken', {
          httpOnly: true,
          sameSite: 'lax', // use 'lax' because our api are on the subdomain of the frontend, if you are using different domains, consider using 'none' and ensure secure is true
          secure: env.NODE_ENV === 'production', // Only set secure flag in production
          maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 86400000, // expire in days
        })
      }

      response(res, toUserResponse(updatedProfile), 'Profile updated successfully')
    } catch (err) {
      next(err)
    }
  }
}

export default new ProfileController()
