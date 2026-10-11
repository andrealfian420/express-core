// Purpose: Shared types for the authentication module.
// Caller: auth.service, auth.controller.
// Dependencies: Prisma `User` type.
// Main Functions: AuthTokens, RegisterInput, RegisterData.
// Side Effects: None (type declarations only).
import { User } from '@prisma/client'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

// Validated registration body. registrationToken is required in OTP mode (from verify-otp).
export interface RegisterInput {
  name: string
  email: string
  password: string
  registrationToken?: string
}

// Service result of registration. The verification token is deliberately absent; the
// controller still serializes `user` with toUserResponse before sending it.
export interface RegisterData {
  user: Omit<User, 'password'>
}
