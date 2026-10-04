// Purpose: Sign short-lived JWT access tokens.
// Caller: auth.service (login, refresh), test fixtures.
// Dependencies: jsonwebtoken, config/env (JWT_ACCESS_SECRET, JWT_ACCESS_EXPIRES).
// Main Functions: generateAccessToken.
// Side Effects: None.
import jwt, { SignOptions } from 'jsonwebtoken'
import { env } from '../config/env'

interface JwtUser {
  id: string | number
}

function generateAccessToken(user: JwtUser): string {
  const options: SignOptions = {
    // Validated in config/env: always a duration with a unit (default 15m), so tokens expire.
    expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions['expiresIn'],
  }

  return jwt.sign(
    {
      sub: String(user.id),
    },
    env.JWT_ACCESS_SECRET,
    options,
  )
}

export { generateAccessToken }
