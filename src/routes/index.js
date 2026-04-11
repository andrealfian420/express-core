const express = require('express')
const router = express.Router()

// Importing Routes
const userRoutes = require('../modules/user/user.route')
const authRoutes = require('../modules/auth/auth.route')

router.use('/users', userRoutes)
router.use('/auth', authRoutes)

router.get('/', (req, res) => {
  res.status(404).json({ message: 'Not Found' })
})

module.exports = router
