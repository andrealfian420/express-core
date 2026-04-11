const authService = require('./auth.service')

// AuthController handles HTTP requests related to authentication.
class AuthController {
  async register(req, res, next) {
    try {
      const newUser = await authService.register(req.body)
      res.status(201).json({
        success: true,
        message:
          'User registered successfully. Please check your email to verify your account.',
        data: newUser,
      })
    } catch (err) {
      next(err)
    }
  }

  async login(req, res, next) {
    try {
      const tokens = await authService.login(req.body.email, req.body.password)
      res.status(200).json({
        success: true,
        data: tokens,
      })
    } catch (err) {
      next(err)
    }
  }

  async refreshToken(req, res, next) {
    try {
      const accessToken = await authService.refreshToken(req.body.refreshToken)
      res.status(200).json({
        success: true,
        data: { accessToken },
      })
    } catch (err) {
      next(err)
    }
  }

  async verifyEmail(req, res, next) {
    try {
      await authService.verifyEmail(req.query.token)
      res.status(200).json({
        success: true,
        message: 'Email verified successfully',
      })
    } catch (err) {
      next(err)
    }
  }

  async requestPasswordReset(req, res, next) {
    try {
      await authService.requestPasswordReset(req.body.email)
      res.status(200).json({
        success: true,
        message: 'Password reset email sent',
      })
    } catch (err) {
      next(err)
    }
  }

  async resetPassword(req, res, next) {
    try {
      await authService.resetPassword(req.body.token, req.body.newPassword)
      res.status(200).json({
        success: true,
        message: 'Password reset successfully',
      })
    } catch (err) {
      next(err)
    }
  }

  async logout(req, res, next) {
    try {
      await authService.logout(req.body.token)
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      })
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new AuthController()
