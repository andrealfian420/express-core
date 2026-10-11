-- Purpose: Create the registration OTP store used when REGISTRATION_VERIFICATION=otp.
-- Caller: `prisma migrate deploy` (Docker migrate service, PM2 deploys, test runner).
-- Dependencies: None (no foreign keys; rows are keyed by lowercased email).
-- Main Functions: email_otps table; unique email (one live code per address, upsert target)
--   and expires_at (cleanup) indexes.
-- Side Effects: Additive only — creates one empty table and two indexes; no existing data changes.
-- Generated with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`.

-- CreateTable
CREATE TABLE "email_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_otps_email_key" ON "email_otps"("email");

-- CreateIndex
CREATE INDEX "email_otps_expires_at_idx" ON "email_otps"("expires_at");
