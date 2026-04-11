const express = require('express')
const userController = require('./user.controller')
const { createUserSchema } = require('./user.validation')
const validate = require('../../middleware/validate.middleware')
const router = express.Router()

router.get('/', userController.index)
router.post('/', validate(createUserSchema), userController.store)

module.exports = router
