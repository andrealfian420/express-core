// Purpose: Data access for the authenticated user's own profile: the user with role and
//   extended profile details, user updates and the profile-details upsert.
// Caller: profile.service.
// Dependencies: Prisma client (optionally a transaction client), profile.fields.
// Main Functions: getProfile, updateProfile, upsertDetails.
// Side Effects: Reads users/roles/user_profiles; updates users; upserts user_profiles.
import { Prisma, User } from '@prisma/client'
import prisma from '../../config/database'
import { UserProfileData } from '../user/user.types'
import { PrismaTx } from '../../types/prisma'
import { ProfileFields } from './profile.fields'

class ProfileRepository {
  async getProfile(
    userId: number,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<UserProfileData | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        id: userId,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        email: true,
        avatar: true,
        isEmailVerified: true,
        roleId: true,
        createdAt: true,
        role: {
          select: {
            title: true,
            access: true,
          },
        },
        profile: {
          select: { phone: true, birthDate: true, gender: true, locale: true },
        },
      },
    })
  }

  async updateProfile(
    userId: number,
    data: Prisma.UserUpdateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User> {
    const db = txOrPrisma || prisma
    return await db.user.update({
      where: {
        id: userId,
      },
      data,
    })
  }

  // One atomic INSERT … ON CONFLICT (user_id) DO UPDATE in the caller's transaction: no
  // read-before-create race when two updates create the row at the same time.
  async upsertDetails(
    userId: number,
    fields: ProfileFields,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<void> {
    const db = txOrPrisma || prisma
    const data = {
      ...fields,
      ...(fields.birthDate !== undefined && {
        birthDate: fields.birthDate === null ? null : new Date(`${fields.birthDate}T00:00:00Z`),
      }),
    }
    await db.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
  }
}

export default new ProfileRepository()
