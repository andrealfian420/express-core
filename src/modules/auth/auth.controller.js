const authService = require('./auth.service')
const response = require('../../utils/response')

// AuthController handles HTTP requests related to authentication.
class AuthController {
  async register(req, res, next) {
    try {
      const newUser = await authService.register(req.body)
      response(
        res,
        newUser,
        'User registered successfully. Please check your email to verify your account.',
        201,
      )
    } catch (err) {
      next(err)
    }
  }

  async login(req, res, next) {
    try {
      const tokens = await authService.login(req.body.email, req.body.password)

      // Set access token in an HTTP-only cookie
      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
      })

      // Set refresh token in an HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: process.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000, // expire in days
      })

      response(
        res,
        {
          accessToken: tokens.accessToken, // Optional for mobile clients that can't use cookies
          refreshToken: tokens.refreshToken,
        },
        'Login successful',
      )
    } catch (err) {
      next(err)
    }
  }

  async refreshToken(req, res, next) {
    try {
      const accessToken = await authService.refreshToken(req)

      // Set new access token in an HTTP-only cookie
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
      })

      response(res, { accessToken }, 'Token refreshed successfully')
    } catch (err) {
      next(err)
    }
  }

  async verifyEmail(req, res, next) {
    try {
      await authService.verifyEmail(req.query.token)
      response(res, null, 'Email verified successfully')
    } catch (err) {
      next(err)
    }
  }

  async requestPasswordReset(req, res, next) {
    try {
      await authService.requestPasswordReset(req.body.email)
      response(res, null, 'Password reset email sent')
    } catch (err) {
      next(err)
    }
  }

  async resetPassword(req, res, next) {
    try {
      await authService.resetPassword(req.body.token, req.body.newPassword)
      response(res, null, 'Password reset successfully')
    } catch (err) {
      next(err)
    }
  }

  async logout(req, res, next) {
    try {
      const token = req.cookies.refreshToken || req.body.token
      await authService.logout(token)

      // Clear cookies
      res.clearCookie('accessToken')
      res.clearCookie('refreshToken')

      response(res, null, 'Logged out successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new AuthController()
