import { Prisma, User } from '@prisma/client'
import prisma from '../../config/database'
import { UserProfileData } from '../user/user.types'

class ProfileRepository {
  async getProfile(
    userId: number,
    txOrPrisma: any = null,
  ): Promise<UserProfileData | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
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
    txOrPrisma: any = null,
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
