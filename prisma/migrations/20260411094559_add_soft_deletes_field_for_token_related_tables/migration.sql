-- AlterTable
ALTER TABLE "email_verification_tokens" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "deleted_at" TIMESTAMP(3);
