const { z } = require('zod')

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email address').optional(),
  avatar: z.string().optional(), // file upload
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .optional(),
})

module.exports = {
  updateProfileSchema,
}
