// Purpose: Seed the editable email templates with their built-in text. Missing keys are
//   inserted; existing rows are never touched, so administrator edits survive reruns.
// Caller: src/seeders/index.ts (seed runner), integration tests.
// Dependencies: Prisma Client, email-template catalog.
// Main Functions: emailTemplateSeeder (default).
// Side Effects: INSERT … ON CONFLICT (key) DO NOTHING into email_templates.
import { EMAIL_TEMPLATE_CATALOG } from '../modules/email-template/email-template.catalog'
import { Seeder } from './seeder.types'

const emailTemplateSeeder: Seeder = {
  name: 'email-template',
  description: 'Editable transactional email templates (built-in text)',
  async run(db) {
    const entries = Object.entries(EMAIL_TEMPLATE_CATALOG)
    // skipDuplicates on the unique key: concurrent runs cannot insert a key twice.
    const { count } = await db.emailTemplate.createMany({
      data: entries.map(([key, template]) => ({
        key,
        title: template.title,
        subject: template.subject,
        body: template.body,
      })),
      skipDuplicates: true,
    })
    const kept = entries.length - count
    return `created ${count} template(s)${kept ? `; ${kept} already present, left unchanged` : ''}`
  },
}

export default emailTemplateSeeder
