const express = require('express')
const router = express.Router()
const { apiRateLimiter } = require('../middleware/rate-limit.middleware')

// Importing Routes
const userRoutes = require('../modules/user/user.route')
const authRoutes = require('../modules/auth/auth.route')
const profileRoutes = require('../modules/profile/profile.route')
const healthRoutes = require('../modules/health/health.route')
const roleRoutes = require('../modules/role/role.route')
const activityLogRoutes = require('../modules/activity-log/activity-log.route')
const helperRoutes = require('../modules/helper/helper.route')

// Place auth routes before general API rate limiter to allow for more specific rate limits on auth endpoints
router.use('/auth', authRoutes)

// Apply general API rate limiter to all routes below
router.use(apiRateLimiter)

// Mounting Routes
router.use('/users', userRoutes)
router.use('/profile', profileRoutes)
router.use('/health', healthRoutes)
router.use('/roles', roleRoutes)
router.use('/activity-logs', activityLogRoutes)
router.use('/utils', helperRoutes)

router.get('/', (req, res) => {
  res.status(404).json({ message: 'Not Found' })
})

module.exports = router
