// Purpose: Data access for registration OTPs (email_otps): issue/replace a code under a resend
//   cooldown, reserve verification attempts, mark verification, consume on registration and
//   prune expired rows.
// Caller: otp.service, system.service (cleanup), dead-letter.service (re-drive guard via Prisma).
// Dependencies: Prisma client and transaction client.
// Main Functions: issue, reserveAttempt, findByEmail, markVerified, consume, deleteExpired,
//   ReservedAttempt.
// Side Effects: INSERT/UPDATE/DELETE on email_otps.
// Notes: Every state change is one guarded statement on the unique email row, so concurrent
//   requests cannot both pass a check: two sends cannot both beat the cooldown, parallel
//   guesses cannot exceed the attempt limit, and a code registers one account at most.
//   Times compare against the database clock (now()).
import { Prisma } from '@prisma/client'
import prisma from '../../config/database'
import { PrismaTx } from '../../types/prisma'

export interface ReservedAttempt {
  id: string
  codeHash: string
  verifiedAt: Date | null
}

class OtpRepository {
  // Inserts the code, or replaces the previous one when it was sent at least
  // `cooldownSeconds` ago (resetting attempts and verification). false = still cooling down.
  async issue(
    tx: PrismaTx,
    email: string,
    codeHash: string,
    expiresMinutes: number,
    cooldownSeconds: number,
  ): Promise<boolean> {
    const rows = (await tx.$queryRaw(Prisma.sql`
      INSERT INTO "email_otps" ("id", "email", "code_hash", "attempts", "sent_at", "expires_at")
      VALUES (gen_random_uuid()::text, ${email}, ${codeHash}, 0, now(),
              now() + make_interval(secs => ${expiresMinutes * 60}))
      ON CONFLICT ("email") DO UPDATE
      SET "code_hash" = EXCLUDED."code_hash",
          "attempts" = 0,
          "sent_at" = now(),
          "expires_at" = EXCLUDED."expires_at",
          "verified_at" = NULL,
          "consumed_at" = NULL
      WHERE "email_otps"."sent_at" <= now() - make_interval(secs => ${cooldownSeconds})
      RETURNING "id"
    `)) as { id: string }[]
    return rows.length === 1
  }

  // Counts the attempt BEFORE the code is compared; null when the code is missing, expired,
  // consumed or out of attempts.
  async reserveAttempt(email: string, maxAttempts: number): Promise<ReservedAttempt | null> {
    const rows = (await prisma.$queryRaw(Prisma.sql`
      UPDATE "email_otps"
      SET "attempts" = "attempts" + 1
      WHERE "email" = ${email}
        AND "consumed_at" IS NULL
        AND "expires_at" > now()
        AND "attempts" < ${maxAttempts}
      RETURNING "id", "code_hash" AS "codeHash", "verified_at" AS "verifiedAt"
    `)) as ReservedAttempt[]
    return rows[0] ?? null
  }

  async findByEmail(email: string) {
    return await prisma.emailOtp.findUnique({ where: { email } })
  }

  // The first verification wins; returns the stored verification time (null if the row is gone).
  async markVerified(id: string): Promise<Date | null> {
    await prisma.emailOtp.updateMany({
      where: { id, verifiedAt: null },
      data: { verifiedAt: new Date() },
    })
    const row = await prisma.emailOtp.findUnique({
      where: { id },
      select: { verifiedAt: true },
    })
    return row?.verifiedAt ?? null
  }

  // Inside the registration transaction: consumes a code verified within the window.
  async consume(
    tx: PrismaTx,
    email: string,
    windowMinutes: number,
  ): Promise<{ id: string; verifiedAt: Date } | null> {
    const rows = (await tx.$queryRaw(Prisma.sql`
      UPDATE "email_otps"
      SET "consumed_at" = now()
      WHERE "email" = ${email}
        AND "consumed_at" IS NULL
        AND "verified_at" > now() - make_interval(secs => ${windowMinutes * 60})
      RETURNING "id", "verified_at" AS "verifiedAt"
    `)) as { id: string; verifiedAt: Date }[]
    return rows[0] ?? null
  }

  // Retention: rows expired before `before`, oldest first, in bounded batches on the
  // expires_at index. Returns rows removed.
  async deleteExpired(before: Date, batchSize = 1_000, maxBatches = 100): Promise<number> {
    let removed = 0
    for (let batch = 0; batch < maxBatches; batch++) {
      const deleted = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "email_otps"
        WHERE "id" = ANY(ARRAY(
          SELECT "id" FROM "email_otps"
          WHERE "expires_at" < ${before}
          ORDER BY "expires_at"
          LIMIT ${batchSize}
        ))
      `)
      removed += deleted
      if (deleted < batchSize) break
    }
    return removed
  }
}

export default new OtpRepository()
