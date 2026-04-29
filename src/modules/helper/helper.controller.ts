import { Request, Response, NextFunction } from 'express'
import helperService from './helper.service'
import response from '../../utils/response'

class HelperController {
  async roleOptions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const roles = await helperService.getRoleOptions()
      response(res, roles, 'Role options retrieved successfully')
    } catch (err) {
      next(err)
    }
  }
}

export default new HelperController()
