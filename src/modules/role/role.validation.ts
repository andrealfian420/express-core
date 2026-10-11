// Purpose: Request schemas for role create/update; userType must come from the USER_TYPES
//   catalogue.
// Caller: role.route (validate middleware), unit tests.
// Dependencies: zod, role.user-types.
// Main Functions: createRoleSchema, updateRoleSchema.
// Side Effects: None.
import { z } from 'zod'
import { USER_TYPES } from './role.user-types'

const userType = z.enum(USER_TYPES, {
  error: (issue) =>
    issue.input === undefined
      ? 'User type is required'
      : `User type must be one of: ${USER_TYPES.join(', ')}`,
})

const createRoleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  userType,
  description: z.string().optional(),
  access: z.array(z.string().min(1)).default([]),
})

const updateRoleSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  userType: userType.optional(),
  description: z.string().nullable().optional(),
  access: z.array(z.string().min(1)).optional(),
})

export { createRoleSchema, updateRoleSchema }
