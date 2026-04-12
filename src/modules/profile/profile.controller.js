const profileService = require('./profile.service')

class ProfileController {
  async getProfile(req, res, next) {
    try {
      const profile = await profileService.getProfile(req.user.sub)
      res.status(200).json({
        success: true,
        data: profile,
      })
    } catch (err) {
      next(err)
    }
  }

  async updateProfile(req, res, next) {
    try {
      const avatar = req.file ? req.file.filename : undefined
      const updatedProfile = await profileService.updateProfile(
        req.user.sub,
        { ...req.body, avatar },
      )

      res.status(200).json({
        success: true,
        data: updatedProfile,
      })
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new ProfileController()
