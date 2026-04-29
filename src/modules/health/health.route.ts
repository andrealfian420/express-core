import { Router } from 'express'
import healthController from './health.controller'

const router = Router()

router.get('/', healthController.healthCheck)
router.get('/ready', healthController.readyCheck)

export default router
