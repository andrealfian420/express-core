// Purpose: Registration OTP flow (REGISTRATION_VERIFICATION=otp): send a code to an address
//   that has no account, verify it into a registration ticket, and consume the verified code
//   when the account is created.
// Caller: otp.controller (send/verify), auth.service.register (consumeForRegistration).
// Dependencies: otp.repository, otp.code, auth.repository (existing accounts), outbox.repository,
//   Prisma transactions, config/env (OTP_* settings), logger, AppError.
// Main Functions: sendCode, verifyCode, consumeForRegistration.
// Side Effects: Writes email_otps; records the code email intent in the outbox inside the same
//   transaction (the code travels only in the job payload, never in logs or responses).
import prisma from '../../config/database'
import { env } from '../../config/env'
import logger from '../../config/logger'
import AppError from '../../utils/appError'
import { PrismaTx } from '../../types/prisma'
import authRepository from '../auth/auth.repository'
import outboxRepository from '../outbox/outbox.repository'
import { EMAIL_JOBS, QUEUE_NAMES } from '../../jobs/config/queue.constants'
import otpRepository from './otp.repository'
import {
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  otpCodeMatches,
  registrationTicket,
  ticketMatches,
} from './otp.code'

class OtpService {
  async sendCode(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail)
    if (await authRepository.findUserByEmailInsensitive(email)) {
      throw new AppError('Email already registered', 409)
    }

    const code = generateOtpCode()
    const issued = await prisma.$transaction(async (tx: PrismaTx) => {
      const fresh = await otpRepository.issue(
        tx,
        email,
        hashOtpCode(email, code),
        env.OTP_EXPIRES_MINUTES,
        env.OTP_RESEND_COOLDOWN_SECONDS,
      )
      if (fresh) {
        await outboxRepository.enqueue(tx, QUEUE_NAMES.EMAIL, EMAIL_JOBS.OTP_CODE, {
          email,
          code,
          expiresMinutes: env.OTP_EXPIRES_MINUTES,
        })
      }
      return fresh
    })

    if (!issued) {
      throw new AppError('Please wait before requesting a new code', 429)
    }
    logger.info('Registration code queued', { email })
  }

  // Returns the registration ticket that register must present. A correct code entered again
  // returns the same ticket (double submits are safe); every try counts against the limit.
  async verifyCode(rawEmail: string, code: string): Promise<string> {
    const email = normalizeEmail(rawEmail)
    const attempt = await otpRepository.reserveAttempt(email, env.OTP_MAX_ATTEMPTS)
    if (!attempt) {
      const row = await otpRepository.findByEmail(email)
      if (
        row &&
        !row.consumedAt &&
        row.expiresAt > new Date() &&
        row.attempts >= env.OTP_MAX_ATTEMPTS
      ) {
        throw new AppError('Too many attempts. Please request a new code', 429)
      }
      throw new AppError('Invalid or expired code', 400)
    }

    if (!otpCodeMatches(email, code, attempt.codeHash)) {
      throw new AppError('Invalid code', 400)
    }

    const verifiedAt = attempt.verifiedAt ?? (await otpRepository.markVerified(attempt.id))
    if (!verifiedAt) {
      throw new AppError('Invalid or expired code', 400)
    }
    logger.info('Registration code verified', { email })
    return registrationTicket(attempt.id, verifiedAt)
  }

  // Inside the registration transaction. Throws (rolling the consumption back with the rest)
  // unless the email has a code verified within the window and the ticket proves that
  // verification: knowing the email alone is not enough to claim it.
  async consumeForRegistration(
    tx: PrismaTx,
    rawEmail: string,
    ticket: string | undefined,
  ): Promise<void> {
    const consumed = ticket
      ? await otpRepository.consume(tx, normalizeEmail(rawEmail), env.OTP_VERIFIED_WINDOW_MINUTES)
      : null
    if (!consumed || !ticketMatches(ticket!, consumed.id, consumed.verifiedAt)) {
      throw new AppError(
        'Email not verified. Request and verify a code before registering.',
        400,
      )
    }
  }
}

export default new OtpService()
