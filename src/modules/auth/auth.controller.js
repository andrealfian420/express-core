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
      response(res, tokens, 'Login successful')
    } catch (err) {
      next(err)
    }
  }

  async refreshToken(req, res, next) {
    try {
      const accessToken = await authService.refreshToken(req.body.refreshToken)
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
      await authService.logout(req.body.token)
      response(res, null, 'Logged out successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new AuthController()
