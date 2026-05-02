import { Prisma } from '@prisma/client'

export type UserProfileResponse = Prisma.UserGetPayload<{
  select: {
    id: true
    slug: true
    name: true
    email: true
    avatar: true
    isEmailVerified: true
    roleId: true
    role: {
      select: {
        title: true
        access: true
      }
    }
  }
}> & {
  avatarUrl?: string
}
