/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `activity_logs` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `email_verification_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `password_reset_tokens` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `refresh_tokens` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "activity_logs" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "email_verification_tokens" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "deleted_at";
