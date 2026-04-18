const express = require('express')
const helperController = require('./helper.controller')
const authMiddleware = require('../../middleware/auth.middleware')
const response = require('../../utils/response')

const router = express.Router()

router.use(authMiddleware)

router.get('/role-options', helperController.roleOptions)

router.get('/', (req, res) => {
  response(res, null, 'Not Found', 404)
})

module.exports = router
