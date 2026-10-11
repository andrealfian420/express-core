// Purpose: Validation, normalization and response shape of the extended profile fields (phone,
//   birth date, gender, locale).
// Caller: profile.validation (request schema), profile.repository/profile.service (response
//   mapping), user.repository (admin user detail), tests.
// Dependencies: zod, config/env (SUPPORTED_LOCALES, canonicalLocale).
// Main Functions: profileFieldSchemas, PROFILE_FIELDS, GENDERS, toProfileResponse,
//   ProfileFields, ProfileResponse.
// Side Effects: None.
// Notes: Every field is optional: absent leaves it unchanged, null or an empty string (multipart
//   forms cannot send null) clears it. Phone separators are stripped before the E.164 check;
//   locales are stored in canonical form.
import { z } from 'zod'
import { canonicalLocale, env } from '../../config/env'

export const PROFILE_FIELDS = ['phone', 'birthDate', 'gender', 'locale'] as const
export const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const

const E164 = /^\+[1-9]\d{6,14}$/

// '' and null both mean "clear"; undefined (absent) means "leave unchanged". A preprocess (not
// a union) keeps each field's own error message.
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema.nullable().optional())

const today = () => new Date().toISOString().slice(0, 10)

export const profileFieldSchemas = {
  phone: clearable(
    z
      .string()
      .transform((value) => value.replace(/[\s().-]/g, ''))
      .pipe(z.string().regex(E164, 'Phone must be in international format, e.g. +628123456789')),
  ),
  birthDate: clearable(
    z.iso
      .date('Birth date must be a date in YYYY-MM-DD format')
      .refine((value) => value <= today(), 'Birth date cannot be in the future')
      .refine((value) => value >= '1900-01-01', 'Birth date must be 1900-01-01 or later'),
  ),
  gender: clearable(z.enum(GENDERS, { error: `Gender must be one of: ${GENDERS.join(', ')}` })),
  locale: clearable(
    z
      .string()
      .transform((value, ctx) => {
        const tag = canonicalLocale(value)
        if (!tag || !env.SUPPORTED_LOCALES.includes(tag)) {
          ctx.addIssue({
            code: 'custom',
            message: `Locale must be one of: ${env.SUPPORTED_LOCALES.join(', ')}`,
          })
          return z.NEVER
        }
        return tag
      }),
  ),
}

export interface ProfileFields {
  phone?: string | null
  birthDate?: string | null
  gender?: (typeof GENDERS)[number] | null
  locale?: string | null
}

export interface ProfileResponse {
  phone: string | null
  birthDate: string | null
  gender: string | null
  locale: string | null
}

// Database row (or its cached JSON) → client shape; dates as YYYY-MM-DD.
export function toProfileResponse(
  row: { phone: string | null; birthDate: Date | string | null; gender: string | null; locale: string | null } | null,
): ProfileResponse | null {
  if (!row) return null
  return {
    phone: row.phone,
    birthDate: row.birthDate ? new Date(row.birthDate).toISOString().slice(0, 10) : null,
    gender: row.gender,
    locale: row.locale,
  }
}
