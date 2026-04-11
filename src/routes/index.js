const express = require('express')
const prisma = require('../config/database')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' })
})

router.get('/users', async (req, res) => {
  const user  = await prisma.User.findMany();
  res.json(user)
});

module.exports = router
