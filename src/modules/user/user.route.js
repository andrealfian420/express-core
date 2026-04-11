const express = require('express')
const userController = require('./user.controller')
const { createUserSchema } = require('./user.validation')
const validate = require('../../middleware/validate.middleware')
const authMiddleware = require('../../middleware/auth.middleware')
const router = express.Router()

router.get('/', authMiddleware, userController.index)
router.post(
  '/',
  authMiddleware,
  validate(createUserSchema),
  userController.store,
)

module.exports = router
