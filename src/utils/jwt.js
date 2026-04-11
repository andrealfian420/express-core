const jwt = require('jsonwebtoken')

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES,
    },
  )
}

module.exports = {
  generateAccessToken,
}
