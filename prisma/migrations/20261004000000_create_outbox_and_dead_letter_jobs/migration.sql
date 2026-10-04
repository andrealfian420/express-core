-- Purpose: Create the transactional outbox and the dead-letter store for reliable job delivery.
-- Caller: `prisma migrate deploy` (Docker migrate service, PM2 deploys, test runner).
-- Dependencies: Previous migrations (no foreign keys to existing tables).
-- Main Functions: OutboxStatus enum; outbox and dead_letter_jobs tables; claim/retention indexes.
-- Side Effects: Additive only — creates one enum, two tables and two indexes; no existing data changes.
-- Generated with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`.

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "outbox" (
    "id" BIGSERIAL NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_jobs" (
    "id" BIGSERIAL NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "job_id" TEXT,
    "payload" JSONB NOT NULL,
    "failed_reason" TEXT NOT NULL,
    "attempts_made" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redriven_at" TIMESTAMP(3),
    "redriven_by" TEXT,
    "redrive_outbox_id" BIGINT,

    CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_status_available_at_idx" ON "outbox"("status", "available_at");

-- CreateIndex
CREATE INDEX "dead_letter_jobs_created_at_idx" ON "dead_letter_jobs"("created_at");
