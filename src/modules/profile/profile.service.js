const AppError = require('../../utils/appError')
const profileRepository = require('./profile.repository')
const storageService = require('../../services/storage.service')

class ProfileService {
  async getProfile(userId) {
    return await profileRepository.getProfile(userId)
  }

  async updateProfile(userId, data) {
    const existingProfile = await profileRepository.getProfile(userId)

    if (!existingProfile) {
      throw new AppError('Profile not found', 404)
    }

    if (data.avatar) {
      if (existingProfile.avatar) {
        storageService.deleteFile('avatars', existingProfile.avatar)
      }
    }

    const updatedProfile = await profileRepository.updateProfile(userId, data)

    return {
      ...updatedProfile,
      avatarUrl: updatedProfile.avatar
        ? storageService.getPublicUrl('avatars', updatedProfile.avatar)
        : null,
    }
  }
}

module.exports = new ProfileService()
