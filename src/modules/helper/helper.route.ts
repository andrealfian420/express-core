import { Request, Response, Router } from 'express'
import helperController from './helper.controller'
import authMiddleware from '../../middleware/auth.middleware'
import response from '../../utils/response'

const router = Router()

router.use(authMiddleware)

router.get('/role-options', helperController.roleOptions)

router.get('/', (req: Request, res: Response): void => {
  response(res, null, 'Not Found', 404)
})

export default router
