// Purpose: Nodemailer SMTP transport shared by the email service.
// Caller: services/email.service.ts.
// Dependencies: nodemailer, config/env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
// Main Functions: transporter (default export).
// Side Effects: Opens SMTP connections when mail is sent.
import nodemailer from 'nodemailer'
import { env } from '../config/env'

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,

  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
})

export default transporter
