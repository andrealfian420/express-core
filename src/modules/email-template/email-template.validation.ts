// Purpose: Request schema for editing an email template.
// Caller: email-template.route (validate middleware).
// Dependencies: zod, email-template.sanitizer.
// Main Functions: updateEmailTemplateSchema.
// Side Effects: None.
// Notes: The key is immutable and never accepted. The body is sanitized here with the email
//   HTML policy (the global xss middleware leaves this one field to it).
import { z } from 'zod'
import { sanitizeTemplateHtml } from './email-template.sanitizer'

export const updateEmailTemplateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(255).optional(),
    subject: z.string().trim().min(1, 'Subject is required').max(255).optional(),
    body: z
      .string()
      .max(100_000)
      .transform(sanitizeTemplateHtml)
      .pipe(z.string().trim().min(1, 'Body is empty after removing unsafe HTML'))
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one of title, subject, body or isActive',
  })
