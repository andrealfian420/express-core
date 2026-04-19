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

      // Set refresh token in an HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        sameSite: 'lax', // use 'lax' because our api are on the subdomain of the frontend, if you are using different domains, consider using 'none' and ensure secure is true
        secure: process.env.NODE_ENV === 'production', // Only set secure flag in production
        maxAge: process.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000, // expire in days
      })

      response(
        res,
        {
          accessToken: tokens.accessToken, // Optional for mobile clients that can't use cookies
        },
        'Login successful',
      )
    } catch (err) {
      next(err)
    }
  }

  async refreshAccessToken(req, res, next) {
    try {
      const token = req.cookies.refreshToken
      const result = await authService.refreshAccessToken(token)

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax', // use 'lax' because our api are on the subdomain of the frontend, if you are using different domains, consider using 'none' and ensure secure is true
        secure: process.env.NODE_ENV === 'production', // Only set secure flag in production
        maxAge: process.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000,
      })

      response(
        res,
        { accessToken: result.accessToken },
        'Token refreshed successfully',
      )
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
      response(res, null, 'If email exists, a reset link has been sent')
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
      const token = req.cookies.refreshToken
      if (token) {
        await authService.logout(token)
      }

      // Clear cookies
      res.clearCookie('refreshToken', {
        httpOnly: true,
        sameSite: 'lax', // use 'lax' because our api are on the subdomain of the frontend, if you are using different domains, consider using 'none' and ensure secure is true
        secure: process.env.NODE_ENV === 'production', // Only set secure flag in production
        maxAge: process.env.REFRESH_TOKEN_EXPIRES_DAYS * 86400000, // expire in days
      })

      response(res, null, 'Logged out successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new AuthController()
