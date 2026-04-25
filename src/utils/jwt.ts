import jwt, { SignOptions } from 'jsonwebtoken'

interface JwtUser {
  id: string | number
}

function generateAccessToken(user: JwtUser): string {
  const secret = process.env.JWT_ACCESS_SECRET as string

  const options: SignOptions = {
    expiresIn: process.env.JWT_ACCESS_EXPIRES as SignOptions['expiresIn'],
  }

  return jwt.sign(
    {
      sub: String(user.id),
    },
    secret,
    options,
  )
}

export { generateAccessToken }
