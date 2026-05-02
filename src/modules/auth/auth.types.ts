import { User } from '@prisma/client'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface RegisterData {
  user: Omit<User, 'password'> // Exclude password from the user object for registration`
}
