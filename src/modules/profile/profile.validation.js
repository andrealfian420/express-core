const { z } = require('zod')

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.email('Invalid email address').optional(),
  avatar: z.string().optional(), // file upload
})

module.exports = {
  updateProfileSchema,
}
