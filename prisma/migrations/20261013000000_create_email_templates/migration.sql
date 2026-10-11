-- Purpose: Create the admin-editable transactional email templates table.
-- Caller: `prisma migrate deploy` (Docker migrate service, PM2 deploys, test runner).
-- Dependencies: None (no foreign keys).
-- Main Functions: email_templates table with a unique key (the send-time lookup and the
--   seeder's skip-existing insert target).
-- Side Effects: Additive only — creates one empty table and its unique index. Until the
--   email-template seeder runs, emails keep using the built-in text.
-- Generated with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`.

-- CreateTable
CREATE TABLE "email_templates" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");
