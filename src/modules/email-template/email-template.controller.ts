// Purpose: HTTP layer for the email template editor (list, show, update).
// Caller: email-template.route.
// Dependencies: email-template.service, response util.
// Main Functions: index, show, update.
// Side Effects: Sends HTTP responses.
import { Request, Response, NextFunction } from 'express'
import emailTemplateService from './email-template.service'
import response from '../../utils/response'

class EmailTemplateController {
  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      response(res, await emailTemplateService.list(req), 'Email templates retrieved')
    } catch (err) {
      next(err)
    }
  }

  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      response(res, await emailTemplateService.show(String(req.params.key)), 'Email template retrieved')
    } catch (err) {
      next(err)
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await emailTemplateService.update(
        String(req.params.key),
        req.body,
        req.user?.sub ?? null,
      )
      response(res, template, 'Email template updated')
    } catch (err) {
      next(err)
    }
  }
}

export default new EmailTemplateController()
