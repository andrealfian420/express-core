// Purpose: Verify upload rejections over HTTP: wrong type, spoofed extension and oversize files
//   are client errors with a clear message, and a rejected upload leaves no file behind.
// Caller: Node HTTP runner.
// Dependencies: Express app through Supertest, actor fixtures, config/storage (temporary
//   STORAGE_ROOT of the test run).
// Main Functions: Avatar upload rejection cases.
// Side Effects: Writes isolated identity rows; uploads only into the temporary storage root.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { setupIntegration, actor } from '../support/integration'
import { api } from '../support/http'
import { uploadsRoot } from '../../src/config/storage'

setupIntegration()

const avatars = path.join(uploadsRoot, 'avatars')
const files = () => (fs.existsSync(avatars) ? fs.readdirSync(avatars).sort() : [])

test('upload: wrong type, spoofed extension and oversize avatars are rejected as client errors (regression)', async () => {
  const { token } = await actor()
  const before = files()

  // Before: these surfaced as 500 responses.
  const wrongType = await api('put', '/profile', token)
    .attach('avatar', Buffer.from('plain text'), { filename: 'a.txt', contentType: 'text/plain' })
    .expect(400)
  assert.equal(wrongType.body.message, 'Invalid file type')

  const spoofed = await api('put', '/profile', token)
    .attach('avatar', Buffer.from('not really'), { filename: 'a.exe', contentType: 'image/png' })
    .expect(400)
  assert.equal(spoofed.body.message, 'Invalid file extension')

  const oversize = await api('put', '/profile', token)
    .attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'a.png', contentType: 'image/png' })
    .expect(413)
  assert.equal(oversize.body.message, 'File too large')

  assert.deepEqual(files(), before)
})
