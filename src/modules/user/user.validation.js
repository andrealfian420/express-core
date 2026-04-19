const { z } = require('zod')

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email address'),
  password: z.string().refine((val) => {
    // min 8, has 1 uppercase, 1 number and special character
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(val)
  }, 'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character'),
  roleId: z.string('Role is required'),
})

const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.email('Invalid email address').optional(),
  roleId: z.string('Role is required'),
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
})

module.exports = {
  createUserSchema,
  updateUserSchema,
}
