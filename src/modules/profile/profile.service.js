const AppError = require('../../utils/appError')
const profileRepository = require('./profile.repository')
const storageService = require('../../services/storage.service')
const cacheService = require('../../services/cache.service')

class ProfileService {
  async getProfile(userId) {
    const cacheKey = `profile:${userId}`
    const cachedProfile = await cacheService.get(cacheKey)

    if (cachedProfile) {
      return cachedProfile
    }

    const profile = await profileRepository.getProfile(userId)

    if (!profile) {
      throw new AppError('Profile not found', 404)
    }

    await cacheService.set(cacheKey, profile, 300) // cache for 5 minutes

    return profile
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

    await cacheService.del(`profile:${userId}`) // invalidate cache

    const cacheKey = `profile:${userId}`
    await cacheService.set(cacheKey, updatedProfile, 300) // cache for 5 minutes

    return {
      ...updatedProfile,
      avatarUrl: updatedProfile.avatar
        ? storageService.getPublicUrl('avatars', updatedProfile.avatar)
        : null,
    }
  }
}

module.exports = new ProfileService()
