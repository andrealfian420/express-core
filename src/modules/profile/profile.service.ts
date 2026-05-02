import AppError from '../../utils/appError'
import profileRepository from './profile.repository'
import storageService from '../../services/storage.service'
import cacheService from '../../services/cache.service'
import systemService from '../../services/system.service'
import prisma from '../../config/database'
import userRepository from '../user/user.repository'
import { makeUniqueSlug } from '../../utils/sluggable'
import bcrypt from 'bcryptjs'
import authRepository from '../auth/auth.repository'
import { UserProfileData } from '../user/user.types'

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10)

export interface UpdateProfileInput {
  name?: string
  email?: string
  avatar?: string
  password?: string
}

class ProfileService {
  async getProfile(userId: number): Promise<UserProfileData> {
    const cacheKey = `profile:${userId}`
    const cachedProfile = (await cacheService.get(
      cacheKey,
    )) as UserProfileData | null

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

  async updateProfile(
    userId: number,
    data: UpdateProfileInput,
  ): Promise<UserProfileData> {
    const existingProfile = await profileRepository.getProfile(userId)

    if (!existingProfile) {
      throw new AppError('Profile not found', 404)
    }

    if (data.avatar) {
      if (existingProfile.avatar) {
        storageService.deleteFile('avatars', existingProfile.avatar)
      }
    }

    const updatedProfile = await prisma.$transaction(async (tx: any) => {
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
        newPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS)
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
        'User updated their profile',
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

export default new ProfileService()
