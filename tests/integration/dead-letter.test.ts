// Purpose: Verify the audited, once-only re-drive of dead-lettered jobs through the outbox, its
//   replay guards for link emails, and the operator CLI exit codes.
// Caller: Node integration runner.
// Dependencies: Dead-letter service, compiled re-drive CLI, isolated PostgreSQL, actor fixtures.
// Main Functions: Re-drive success/refusal/concurrency cases and CLI cases.
// Side Effects: Writes isolated dead-letter, outbox and token rows; runs the CLI as a child
//   process with the test configuration.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { setupIntegration, actor, db } from '../support/integration'
import deadLetters, {
  RedriveError,
} from '../../src/modules/dead-letter/dead-letter.service'

setupIntegration()

const CLI = path.resolve(__dirname, '../../src/scripts/redrive-dlq.js')
const future = () => new Date(Date.now() + 3_600_000)

function deadLetter(jobName: string, payload: object, queueName = 'email') {
  return db.deadLetterJob.create({
    data: { queueName, jobName, payload, failedReason: 'SMTP rejected', attemptsMade: 3 },
  })
}

test('redrive: a still-valid reset email becomes one outbox intent and the dead-letter row records it', async () => {
  const { user } = await actor()
  await db.passwordResetToken.create({
    data: { token: 'valid-reset', userId: user.id, expiresAt: future() },
  })
  const payload = { email: user.email, name: user.name, token: 'valid-reset' }
  const row = await deadLetter('sendResetPasswordEmail', payload)

  const result = await deadLetters.redrive(row.id, 'alice')
  const intent = await db.outbox.findUniqueOrThrow({ where: { id: result.outboxId } })
  assert.deepEqual(
    [intent.queueName, intent.jobName, intent.status, intent.payload],
    ['email', 'sendResetPasswordEmail', 'PENDING', payload],
  )
  const audited = await db.deadLetterJob.findUniqueOrThrow({ where: { id: row.id } })
  assert.ok(audited.redrivenAt)
  assert.equal(audited.redrivenBy, 'alice')
  assert.equal(audited.redriveOutboxId, result.outboxId)

  await assert.rejects(() => deadLetters.redrive(row.id), /already re-driven/)
  assert.equal(await db.outbox.count(), 1)
})

test('redrive: two concurrent re-drives of one row produce exactly one intent', async () => {
  const row = await deadLetter('sendVerificationSuccessEmail', {
    email: 'user@example.invalid',
    name: 'User',
  })
  const results = await Promise.allSettled([
    deadLetters.redrive(row.id),
    deadLetters.redrive(row.id),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const [rejected] = results.filter((r) => r.status === 'rejected')
  assert.ok((rejected as PromiseRejectedResult).reason instanceof RedriveError)
  assert.equal(await db.outbox.count(), 1)
})

test('redrive: link emails whose token is gone, expired or used are refused, as are unknown queues and ids', async () => {
  const { user } = await actor()
  await db.emailVerificationToken.create({
    data: { token: 'expired-verify', userId: user.id, expiresAt: new Date(0) },
  })
  await db.passwordResetToken.create({
    data: { token: 'used-reset', userId: user.id, expiresAt: future(), usedAt: new Date() },
  })
  await db.passwordResetToken.create({
    data: { token: 'expired-reset', userId: user.id, expiresAt: new Date(0) },
  })
  for (const [jobName, payload, reason] of [
    ['sendVerificationEmail', { token: 'missing' }, /no longer exists/],
    ['sendVerificationEmail', { token: 'expired-verify' }, /has expired/],
    ['sendResetPasswordEmail', { token: 'used-reset' }, /already used/],
    ['sendResetPasswordEmail', { token: 'expired-reset' }, /has expired/],
    ['sendResetPasswordEmail', {}, /no longer exists/],
  ] as const) {
    const row = await deadLetter(jobName, payload)
    await assert.rejects(() => deadLetters.redrive(row.id), reason)
    assert.equal(
      (await db.deadLetterJob.findUniqueOrThrow({ where: { id: row.id } })).redrivenAt,
      null,
    )
  }
  const unroutable = await deadLetter('generateReport', {}, 'reports')
  await assert.rejects(() => deadLetters.redrive(unroutable.id), /Unknown queue "reports"/)
  await assert.rejects(() => deadLetters.redrive(999_999n), /not found/)
  assert.equal(await db.outbox.count(), 0)
})

test('redrive CLI: exit 0 with a summary; exit 1 for refusals and malformed arguments', async () => {
  const row = await deadLetter('sendVerificationSuccessEmail', {
    email: 'user@example.invalid',
    name: 'User',
  })
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], {
      env: process.env,
      encoding: 'utf8',
      timeout: 30_000,
    })

  const ok = cli(String(row.id), '--by', 'ops')
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, new RegExp(`Re-drove dead-letter job ${row.id} \\(email:sendVerificationSuccessEmail\\)`))
  assert.equal(
    (await db.deadLetterJob.findUniqueOrThrow({ where: { id: row.id } })).redrivenBy,
    'ops',
  )

  const again = cli(String(row.id))
  assert.equal(again.status, 1)
  assert.match(again.stderr, /already re-driven/)
  for (const args of [[], ['abc'], [String(row.id), '--by']]) {
    const bad = cli(...args)
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /Usage:/)
  }
  assert.equal(await db.outbox.count(), 1)
})
