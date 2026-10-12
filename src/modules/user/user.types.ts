// Purpose: Shared user payload types for the user and profile modules.
// Caller: user/profile repositories, services and controllers.
// Dependencies: Prisma types, profile.fields (ProfileResponse).
// Main Functions: UserProfileData, UserDetailData, UserListData.
// Side Effects: None (type declarations only).
import { Prisma } from '@prisma/client'
import { ProfileResponse } from '../profile/profile.fields'

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
  // Extended profile details (phone, birth date, gender, locale); null when never set.
  profile?: ProfileResponse | null
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

// Admin user detail (GET /users/:slug). The role reference lets a client preselect the
// user's role when editing; its id is the value /utils/role-options already exposes.
export type UserDetailData = Omit<UserProfileData, 'role'> & {
  role: { id: number; slug: string; title: string } | null
}
