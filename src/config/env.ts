// Purpose: Load and validate runtime configuration once, before any consumer reads it.
// Caller: Imported first by src/server.ts and src/jobs/run-workers.ts; every module that
//   needs configuration imports `env` from here instead of reading process.env.
// Dependencies: dotenv, zod.
// Main Functions: env (validated, frozen), parseEnv, Env.
// Side Effects: Reads `.env` from the working directory into process.env without overriding
//   variables that the real environment already sets (skipped when NODE_ENV=test); throws at
//   import time when the configuration is invalid. Error messages name keys, never values.
import dotenv from 'dotenv'
import { z } from 'zod'

// Precedence: real environment variables (Docker env_file, PM2, CI, shell) always win and
// `.env` only fills the gaps. Tests never read a developer `.env`; the test runner provides
// every value explicitly.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ quiet: true })
}

// Secrets shipped in .env.example; rejected in production together with short secrets.
const PLACEHOLDER_SECRETS = new Set(['change_this_to_a_secure_random_string'])
const MIN_PRODUCTION_SECRET_LENGTH = 32

const TRUE_VALUES = ['true', '1', 'yes', 'on']
const FALSE_VALUES = ['false', '0', 'no', 'off']

// jsonwebtoken reads a unit-less string as milliseconds, so a unit is mandatory.
const DURATION =
  /^\d+(\.\d+)?\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)$/i
const BYTE_SIZE = /^\d+(\.\d+)?\s*(b|kb|mb|gb)?$/i

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Browsers send `scheme://host[:port]` exactly; anything else would never match.
const isOrigin = (value: string): boolean =>
  isHttpUrl(value) && new URL(value).origin === value

const text = () => z.preprocess(blankToUndefined, z.string().trim().optional())
const secret = () => z.preprocess(blankToUndefined, z.string().optional())
const required = () =>
  z.preprocess(blankToUndefined, z.string({ error: 'is required' }))

const integer = (fallback: number, min: number, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: `must be an integer between ${min} and ${max}` })
      .int({ error: `must be an integer between ${min} and ${max}` })
      .min(min, { error: `must be an integer between ${min} and ${max}` })
      .max(max, { error: `must be an integer between ${min} and ${max}` })
      .default(fallback),
  )

const flag = (fallback: boolean) =>
  z.preprocess(
    (value) => {
      const normalized = blankToUndefined(value)
      return typeof normalized === 'string'
        ? normalized.trim().toLowerCase()
        : normalized
    },
    z
      .enum([...TRUE_VALUES, ...FALSE_VALUES] as [string, ...string[]], {
        error: 'must be true or false',
      })
      .transform((value) => TRUE_VALUES.includes(value))
      .default(fallback),
  )

const schema = z
  .object({
    NODE_ENV: text(),
    PORT: integer(3001, 1, 65535),
    APP_NAME: z.preprocess(blankToUndefined, z.string().trim().default('App')),
    APP_URL: required()
      .pipe(z.string().trim())
      .refine(isHttpUrl, 'must be an absolute http(s) URL'),
    FORMLIMIT: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .regex(BYTE_SIZE, 'must be a byte size such as 52428800 or 50mb')
        .default('52428800'),
    ),
    ENABLELOG: flag(false),
    LOG_TO_FILES: flag(false),
    ALLOWED_ORIGINS: z
      .preprocess((value) => blankToUndefined(value) ?? '', z.string())
      .transform((list) =>
        list
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .refine(
        (origins) => origins.every(isOrigin),
        'entries must be exact origins such as https://app.example.com (no path or trailing slash)',
      ),
    STORAGE_ROOT: text(),
    DATABASE_URL: required().refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      'must be a postgresql:// connection string',
    ),
    REDIS_HOST: z.preprocess(
      blankToUndefined,
      z.string().trim().default('127.0.0.1'),
    ),
    REDIS_PORT: integer(6379, 1, 65535),
    REDIS_PASSWORD: secret(),
    JWT_ACCESS_SECRET: required(),
    JWT_ACCESS_EXPIRES: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .regex(DURATION, 'must be a duration with a unit, such as 15m or 1h')
        .default('15m'),
    ),
    REFRESH_TOKEN_EXPIRES_DAYS: integer(7, 1, 3650),
    EMAIL_VERIFICATION_EXPIRES_HOURS: integer(24, 1, 8760),
    PASSWORD_RESET_EXPIRES_MINUTES: integer(60, 1, 10080),
    BCRYPT_ROUNDS: integer(10, 4, 31),
    SMTP_HOST: text(),
    SMTP_PORT: integer(587, 1, 65535),
    SMTP_USER: text(),
    SMTP_PASS: secret(),
    SMTP_FROM: text(),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== 'production') return
    if (PLACEHOLDER_SECRETS.has(config.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'still uses the .env.example placeholder',
      })
    } else if (config.JWT_ACCESS_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: `must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
      })
    }
  })

export type Env = z.infer<typeof schema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
    )
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}`,
    )
  }

  return result.data
}

export const env: Readonly<Env> = Object.freeze(parseEnv(process.env))
