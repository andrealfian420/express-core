// Purpose: Request schemas for the registration OTP endpoints.
// Caller: otp.route (validate middleware).
// Dependencies: zod, otp.code (OTP_DIGITS).
// Main Functions: sendOtpSchema, verifyOtpSchema.
// Side Effects: None.
import { z } from 'zod'
import { OTP_DIGITS } from './otp.code'

const email = z.string().trim().email('Invalid email address')

export const sendOtpSchema = z.object({ email })

export const verifyOtpSchema = z.object({
  email,
  code: z
    .string()
    .regex(new RegExp(`^\\d{${OTP_DIGITS}}$`), `Code must be a ${OTP_DIGITS}-digit number`),
})
