const { z } = require('zod')

// Validation schemas for authentication-related requests.
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  email: z.email('Invalid email address'),
  password: z.refine((val) => {
    // min 8, has 1 uppercase, 1 number and special character
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(val)
  }, 'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character'),
})

const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const requestPasswordResetSchema = z.object({
  email: z.email('Invalid email address'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.refine((val) => {
    // min 8, has 1 uppercase, 1 number and special character
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(val)
  }, 'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character'),
})

module.exports = {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
}
