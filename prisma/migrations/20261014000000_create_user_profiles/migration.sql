-- Purpose: Create the optional one-to-one user profile (phone, birth date, gender, locale).
-- Caller: `prisma migrate deploy` (Docker migrate service, PM2 deploys, test runner).
-- Dependencies: users table (foreign key, cascades on delete).
-- Main Functions: Gender enum; user_profiles table keyed by user_id (primary and foreign key).
-- Side Effects: Additive only — creates one enum, one empty table and its foreign key; no
--   existing data changes. Users without a row simply have no profile details.
-- Generated with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'undisclosed');

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" INTEGER NOT NULL,
    "phone" TEXT,
    "birth_date" DATE,
    "gender" "Gender",
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
