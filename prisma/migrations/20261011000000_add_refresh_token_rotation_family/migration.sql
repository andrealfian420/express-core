-- Purpose: Track refresh-token rotation in the database: session family, rotation time and the
--   sealed successor used during the concurrency grace window, plus revocation/cleanup indexes.
-- Caller: `prisma migrate deploy` (Docker migrate service, PM2 deploys, test runner).
-- Dependencies: 20260411055931_init (refresh_tokens); PostgreSQL 13+ for gen_random_uuid().
-- Main Functions: family_id, rotated_at, successor_ciphertext columns; (user_id, family_id) and
--   (expires_at) indexes.
-- Side Effects: Additive only. Existing rows each get their own family and stay valid as
--   unrotated tokens. The volatile default rewrites refresh_tokens once under an exclusive lock
--   (one row per live session before this change); the two plain CREATE INDEX statements block
--   writes to the table while they build.
-- Generated with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "family_id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "rotated_at" TIMESTAMP(3),
ADD COLUMN     "successor_ciphertext" BYTEA;

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_family_id_idx" ON "refresh_tokens"("user_id", "family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
