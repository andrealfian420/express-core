import { z } from 'zod'

// Validation schemas for authentication-related requests.
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .regex(
      /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character',
    ),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const requestPasswordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .regex(
      /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character',
    ),
})

export {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
}
