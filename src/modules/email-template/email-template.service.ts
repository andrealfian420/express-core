// Purpose: Email template business logic: render a template for sending (database text when
//   active, built-in text otherwise), and view/list/edit templates with validation and audit.
// Caller: email.service (render, from the email worker), email-template.controller.
// Dependencies: email-template repository/catalog/render, system.service (activity log),
//   Prisma transactions, config/env (APP_NAME), logger, AppError.
// Main Functions: render, list, show, update, toTemplateResponse.
// Side Effects: Reads email_templates on every render (no cache: an edit applies to the next
//   email); update writes the row and an activity log in one transaction.
import { Request } from 'express'
import { EmailTemplate } from '@prisma/client'
import prisma from '../../config/database'
import { env } from '../../config/env'
import logger from '../../config/logger'
import AppError from '../../utils/appError'
import { PrismaTx } from '../../types/prisma'
import { PaginatedResult } from '../../utils/paginator'
import systemService from '../../services/system.service'
import emailTemplateRepository, { EmailTemplateListItem } from './email-template.repository'
import {
  EMAIL_TEMPLATE_CATALOG,
  EmailTemplateKey,
  GLOBAL_TEMPLATE_VARIABLES,
  isTemplateKey,
  templateProblems,
} from './email-template.catalog'
import { renderTemplate, TemplateVariables } from './email-template.render'

export interface UpdateEmailTemplateInput {
  title?: string
  subject?: string
  body?: string
  isActive?: boolean
}

export function toTemplateResponse(row: EmailTemplate) {
  const definition = EMAIL_TEMPLATE_CATALOG[row.key as EmailTemplateKey]
  return {
    key: row.key,
    title: row.title,
    subject: row.subject,
    body: row.body,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
    variables: [...(definition?.variables ?? []), ...GLOBAL_TEMPLATE_VARIABLES],
    requiredVariables: definition?.required ?? [],
  }
}

class EmailTemplateService {
  async render(
    key: EmailTemplateKey,
    variables: TemplateVariables,
  ): Promise<{ subject: string; html: string }> {
    const row = await emailTemplateRepository.findByKey(key)
    if (!row) {
      logger.warn('Email template is not seeded; sending the built-in text', { key })
    }
    const source = row?.isActive ? row : EMAIL_TEMPLATE_CATALOG[key]
    return renderTemplate(source, { app_name: env.APP_NAME, ...variables })
  }

  async list(req: Request): Promise<PaginatedResult<EmailTemplateListItem>> {
    return await emailTemplateRepository.paginate(req)
  }

  async show(key: string) {
    return toTemplateResponse(await this.find(key))
  }

  async update(key: string, data: UpdateEmailTemplateInput, updatedBy: number | null = null) {
    const template = await this.find(key)
    const problems = templateProblems(template.key as EmailTemplateKey, {
      subject: data.subject ?? template.subject,
      body: data.body ?? template.body,
    })
    if (problems.length > 0) {
      throw new AppError('Validation failed', 400, problems)
    }

    const updated = await prisma.$transaction(async (tx: PrismaTx) => {
      const row = await emailTemplateRepository.update(template.key, data, tx)
      await systemService.logActivity(
        updatedBy,
        'UPDATE',
        'EmailTemplate',
        row.id,
        `Email template updated: ${row.key}`,
        { title: template.title, subject: template.subject, isActive: template.isActive },
        { title: row.title, subject: row.subject, isActive: row.isActive },
        tx,
      )
      return row
    })
    return toTemplateResponse(updated)
  }

  private async find(key: string): Promise<EmailTemplate> {
    const row = isTemplateKey(key) ? await emailTemplateRepository.findByKey(key) : null
    if (!row) {
      throw new AppError('Email template not found', 404)
    }
    return row
  }
}

export default new EmailTemplateService()
