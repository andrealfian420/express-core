import { Request, Response, Router } from 'express'
import { apiRateLimiter } from '../middleware/rate-limit.middleware'

// Importing Routes
import userRoutes from '../modules/user/user.route'
import authRoutes from '../modules/auth/auth.route'
import profileRoutes from '../modules/profile/profile.route'
import healthRoutes from '../modules/health/health.route'
import roleRoutes from '../modules/role/role.route'
import activityLogRoutes from '../modules/activity-log/activity-log.route'
import helperRoutes from '../modules/helper/helper.route'

const router = Router()

// Place auth routes before general API rate limiter to allow for more specific rate limits on auth endpoints
router.use('/auth', authRoutes)

// Apply general API rate limiter to all routes below
router.use(apiRateLimiter)

// Mounting Routes
router.use('/users', userRoutes)
router.use('/profile', profileRoutes)
router.use('/health', healthRoutes)
router.use('/roles', roleRoutes)
router.use('/activity-logs', activityLogRoutes)
router.use('/utils', helperRoutes)

router.get('/', (req: Request, res: Response): void => {
  res.status(404).json({ message: 'Not Found' })
})

export default router
