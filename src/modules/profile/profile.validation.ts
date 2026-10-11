// Purpose: Request schema for updating the authenticated user's own profile.
// Caller: profile.route (validate middleware, after the avatar upload).
// Dependencies: zod, profile.fields (extended profile field schemas).
// Main Functions: updateProfileSchema.
// Side Effects: None.
import { z } from 'zod'
import { profileFieldSchemas } from './profile.fields'

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address').optional(),
  avatar: z.string().optional(), // file upload
  password: z
    .string()
    .refine((val) => {
      if (!val) {
        return true // allow empty password (no change)
      }

      // min 8, has 1 uppercase, 1 number and special character
      return /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(
        val,
      )
    }, 'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character')
    .optional(),
  ...profileFieldSchemas,
})

export { updateProfileSchema }
