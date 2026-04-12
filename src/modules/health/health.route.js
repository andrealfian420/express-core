const express = require('express')
const healthController = require('./health.controller')
const router = express.Router()

router.get('/', healthController.healthCheck)
router.get('/ready', healthController.readyCheck)

module.exports = router
