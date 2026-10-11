// Purpose: Data access for email_templates: lookup by key (send time and editor), paginated
//   listing and updates.
// Caller: email-template.service.
// Dependencies: Prisma client, utils/paginator.
// Main Functions: findByKey, paginate, update.
// Side Effects: Reads and updates email_templates.
import { Request } from 'express'
import { EmailTemplate, Prisma } from '@prisma/client'
import prisma from '../../config/database'
import { paginate, PaginatedResult } from '../../utils/paginator'
import { PrismaTx } from '../../types/prisma'

export type EmailTemplateListItem = Pick<
  EmailTemplate,
  'key' | 'title' | 'subject' | 'isActive' | 'updatedAt'
>

class EmailTemplateRepository {
  // Unique-key lookup (one index probe per email sent).
  async findByKey(key: string, txOrPrisma: PrismaTx | null = null): Promise<EmailTemplate | null> {
    const db = txOrPrisma || prisma
    return await db.emailTemplate.findUnique({ where: { key } })
  }

  async paginate(req: Request): Promise<PaginatedResult<EmailTemplateListItem>> {
    return await paginate<EmailTemplateListItem>(
      prisma.emailTemplate,
      {
        select: { key: true, title: true, subject: true, isActive: true, updatedAt: true },
        searchFields: ['key', 'title', 'subject'],
        allowedSorts: ['key', 'title', 'updatedAt'],
        defaultSort: 'key',
        defaultSortDir: 'asc',
      },
      req,
    )
  }

  async update(
    key: string,
    data: Prisma.EmailTemplateUpdateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<EmailTemplate> {
    const db = txOrPrisma || prisma
    return await db.emailTemplate.update({ where: { key }, data })
  }
}

export default new EmailTemplateRepository()
