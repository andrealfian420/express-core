// Purpose: Map internal user shapes to the client-safe user response contract.
// Caller: user.controller (show/store/update), profile.controller (get/update),
//   auth.controller (register).
// Dependencies: None (pure function over plain objects).
// Main Functions: toUserResponse, PUBLIC_USER_FIELDS, UserResponse.
// Side Effects: None.
// Notes: An explicit allowlist rather than a denylist: the password hash, internal ids
//   (`id`, `roleId`), `deletedAt` and any column added later never reach clients unless
//   it is listed here on purpose. `slug` is the public identifier of a user.

export const PUBLIC_USER_FIELDS = [
  'slug',
  'name',
  'email',
  'avatar',
  'avatarUrl',
  'isEmailVerified',
  'createdAt',
  'updatedAt',
  'role',
] as const

type PublicUserField = (typeof PUBLIC_USER_FIELDS)[number]

// Only the public fields that the given shape actually carries.
export type UserResponse<T> = Pick<T, Extract<keyof T, PublicUserField>>

export function toUserResponse<T extends object>(user: T): UserResponse<T> {
  const safe: Partial<Record<PublicUserField, unknown>> = {}
  for (const field of PUBLIC_USER_FIELDS) {
    if (field in user) {
      safe[field] = (user as Record<string, unknown>)[field]
    }
  }

  return safe as UserResponse<T>
}
