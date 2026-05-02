import { Prisma } from '@prisma/client'

export type UserProfileData = Prisma.UserGetPayload<{
  select: {
    id: true
    slug: true
    name: true
    email: true
    avatar: true
    isEmailVerified: true
    roleId: true
    createdAt: true
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

export type UserListData = Prisma.UserGetPayload<{
  select: {
    id: true
    name: true
    slug: true
    email: true
    isEmailVerified: true
    createdAt: true
    role: {
      select: {
        id: true
        title: true
        slug: true
        userType: true
      }
    }
  }
}> & {
  roleName?: string
  registeredAt?: string
}
