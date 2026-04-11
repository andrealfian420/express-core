const express = require('express')
const router = express.Router()

// Importing Routes
const userRoutes = require('../modules/user/user.route')
const authRoutes = require('../modules/auth/auth.route')
const profileRoutes = require('../modules/profile/profile.route')

// Mounting Routes
router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/profile', profileRoutes)

router.get('/', (req, res) => {
  res.status(404).json({ message: 'Not Found' })
})

module.exports = router
