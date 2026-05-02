import { Prisma, User } from '@prisma/client'
import prisma from '../../config/database'
import { UserProfileData } from '../user/user.types'
import { PrismaTx } from '../../types/prisma'

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
}

export default new ProfileRepository()
