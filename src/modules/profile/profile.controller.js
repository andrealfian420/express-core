const profileService = require('./profile.service')
const response = require('../../utils/response')

class ProfileController {
  async getProfile(req, res, next) {
    try {
      const profile = await profileService.getProfile(req.user.sub)
      response(res, profile, 'Profile retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async updateProfile(req, res, next) {
    try {
      const avatar = req.file ? req.file.filename : undefined
      const updatedProfile = await profileService.updateProfile(req.user.sub, {
        ...req.body,
        avatar,
      })

      // invalidate refresh tokens to force logout from all devices if password is changed
      if (req.body.password) {
        res.clearCookie('refreshToken', {
          httpOnly: true,
          sameSite: 'lax', // use 'lax' because our api are on the subdomain of the frontend, if you are using different domains, consider using 'none' and ensure secure is true
          secure: process.env.NODE_ENV === 'production', // Only set secure flag in production
          maxAge: process.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000, // expire in days
        })
      }

      response(res, updatedProfile, 'Profile updated successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new ProfileController()
