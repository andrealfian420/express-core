import crypto from 'crypto'

function generateToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

export { generateToken }
