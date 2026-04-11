const express = require('express')
const router = express.Router()

// Importing Routes
const userRoutes = require('../modules/user/user.route')

router.use('/users', userRoutes)

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' })
})

module.exports = router
