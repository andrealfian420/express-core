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
      response(res, updatedProfile, 'Profile updated successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new ProfileController()
