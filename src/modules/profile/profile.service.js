const AppError = require('../../utils/appError')
const profileRepository = require('./profile.repository')
const storageService = require('../../services/storage.service')
const cacheService = require('../../services/cache.service')
const systemService = require('../../services/system.service')
const prisma = require('../../config/database')
const userRepository = require('../user/user.repository')
const { makeUniqueSlug } = require('../../utils/sluggable')
const bcrypt = require('bcryptjs')
const authRepository = require('../auth/auth.repository')

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

    if (profile.avatar) {
      profile.avatarUrl = storageService.getPublicUrl(
        'uploads/avatars',
        profile.avatar,
      )
    }

    await cacheService.set(cacheKey, profile, 900) // cache for 15 minutes

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

    const updatedProfile = await prisma.$transaction(async (tx) => {
      // onUpdate: regenerate slug whenever name changes
      let newSlug
      if (data.name && data.name !== existingProfile.name) {
        newSlug = await makeUniqueSlug(
          data.name,
          (candidate, excludeId) =>
            userRepository.findBySlugExcluding(candidate, excludeId, tx),
          existingProfile.id,
        )
      }

      let newPassword = ''
      if (data.password) {
        newPassword = await bcrypt.hash(
          data.password,
          parseInt(process.env.BCRYPT_ROUNDS),
        )
      }

      const updated = await profileRepository.updateProfile(
        userId,
        {
          ...(data.name && { name: data.name }),
          ...(newSlug && { slug: newSlug }),
          ...(data.email && { email: data.email }),
          ...(data.avatar && { avatar: data.avatar }),
          ...(data.password && { password: newPassword }),
        },
        tx,
      )

      // invalidate all existing refresh tokens for the user to force logout
      // from all devices if password is changed
      if (data.password && newPassword.length) {
        await authRepository.deleteRefreshTokensByUserId(userId, tx)
      }

      await systemService.logActivity(
        userId,
        'UPDATE',
        'Profile',
        userId,
        'Profile updated',
        {
          name: existingProfile.name,
          email: existingProfile.email,
          avatar: existingProfile.avatar,
        },
        {
          name: updated.name,
          email: updated.email,
          avatar: updated.avatar,
        },
        tx,
      )

      return updated
    })

    await cacheService.del(`profile:${userId}`) // Invalidate old cache

    // Fetch profile data from sibling service to ensure we get the same data for caching and response
    const newProfileData = await this.getProfile(updatedProfile.id)

    await cacheService.set(`profile:${userId}`, newProfileData, 900) // set new cache with new profile data

    return newProfileData
  }
}

module.exports = new ProfileService()
