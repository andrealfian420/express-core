// Purpose: Verify the shared storage root and file lifecycle without touching application uploads.
// Caller: Node unit runner.
// Dependencies: Runner-owned temporary STORAGE_ROOT, filesystem, storage service and config.
// Main Functions: Storage root resolution, deletion, existence and public URL cases.
// Side Effects: Creates and deletes files under the runner-owned temporary directory.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import storage from '../../src/services/storage.service'
import { storageRoot, uploadsRoot } from '../../src/config/storage'

test('storage: one configured root serves uploads, deletion and existence checks', () => {
  assert.equal(storageRoot, path.resolve(process.env.STORAGE_ROOT!))
  assert.equal(uploadsRoot, path.join(storageRoot, 'uploads'))
  fs.mkdirSync(path.join(uploadsRoot, 'avatars'), { recursive: true })
  const file = path.join(uploadsRoot, 'avatars', 'test.png')
  const sibling = path.join(uploadsRoot, 'avatars', 'keep.png')
  fs.writeFileSync(file, 'fixture')
  fs.writeFileSync(sibling, 'fixture')
  assert.equal(storage.fileExists('avatars', 'test.png'), true)
  storage.deleteFile('avatars', 'test.png')
  assert.equal(fs.existsSync(file), false)
  assert.equal(fs.existsSync(sibling), true)
  assert.doesNotThrow(() => storage.deleteFile('avatars', 'missing.png'))
  assert.equal(storage.fileExists('avatars', 'missing.png'), false)
  assert.equal(
    storage.getPublicUrl('uploads/avatars', 'test.png'),
    'http://test.invalid/storage/uploads/avatars/test.png',
  )
})
