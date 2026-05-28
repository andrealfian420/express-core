import crypto from 'crypto'

function generateToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export { generateToken, hashToken }
