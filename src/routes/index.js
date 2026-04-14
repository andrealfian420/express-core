const express = require('express')
const router = express.Router()

// Importing Routes
const userRoutes = require('../modules/user/user.route')
const authRoutes = require('../modules/auth/auth.route')
const profileRoutes = require('../modules/profile/profile.route')
const healthRoutes = require('../modules/health/health.route')
const roleRoutes = require('../modules/role/role.route')
const activityLogRoutes = require('../modules/activity-log/activity-log.route')

// Mounting Routes
router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/profile', profileRoutes)
router.use('/health', healthRoutes)
router.use('/roles', roleRoutes)
router.use('/activity-logs', activityLogRoutes)

router.get('/', (req, res) => {
  res.status(404).json({ message: 'Not Found' })
})

module.exports = router
