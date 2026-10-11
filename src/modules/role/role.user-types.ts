// Purpose: Catalogue of the user types a role may carry (Role.userType). Routes gate whole
//   areas by these names with checkUserType(), so they are code-level values like permissions.
// Caller: role.validation (create/update), role.controller (GET /roles/user-types),
//   user-type.middleware (startup check), seeders/role.seeder.
// Dependencies: None.
// Main Functions: USER_TYPES, UserType, isUserType.
// Side Effects: None.
// Notes: Extension point: add a type here before routes or roles use it. Removing one does not
//   change stored roles; they keep working but must pick a listed type when the type is edited.

export const USER_TYPES = ['Administrator', 'Member'] as const

export type UserType = (typeof USER_TYPES)[number]

export function isUserType(value: unknown): value is UserType {
  return (USER_TYPES as readonly unknown[]).includes(value)
}
