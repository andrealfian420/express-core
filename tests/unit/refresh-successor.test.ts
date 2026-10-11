// Purpose: Verify the sealed refresh-token successor: it opens only with the predecessor token,
//   on its own row and under the same server secret, and never exposes the successor.
// Caller: Node unit runner.
// Dependencies: src/modules/auth/refresh-successor, utils/token.
// Main Functions: Seal/open round trip and refusal cases.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  openSuccessor,
  sealSuccessor,
} from '../../src/modules/auth/refresh-successor'
import { generateToken, hashToken } from '../../src/utils/token'

const predecessor = generateToken()
const predecessorHash = hashToken(predecessor)
const successor = generateToken()

test('refresh successor: the predecessor token opens the sealed successor; the seal hides it', () => {
  const sealed = sealSuccessor(predecessor, predecessorHash, successor)
  assert.equal(sealed.length, 93)
  assert.equal(openSuccessor(predecessor, predecessorHash, sealed), successor)
  assert.equal(sealed.includes(Buffer.from(successor, 'hex')), false)
  assert.equal(sealed.includes(Buffer.from(successor)), false)
  // A fresh IV per seal: the same input never produces the same bytes.
  assert.notDeepEqual(sealSuccessor(predecessor, predecessorHash, successor), sealed)
})

test('refresh successor: another token, another row, another secret or altered bytes do not open it', () => {
  const sealed = sealSuccessor(predecessor, predecessorHash, successor)
  const other = generateToken()
  assert.equal(openSuccessor(other, predecessorHash, sealed), null)
  // The stored hash cannot stand in for the plaintext token it was derived from.
  assert.equal(openSuccessor(predecessorHash, predecessorHash, sealed), null)
  assert.equal(openSuccessor(predecessor, hashToken(other), sealed), null)
  assert.equal(openSuccessor(predecessor, predecessorHash, sealed, 'another-secret'), null)
  for (const index of [0, 5, 20, sealed.length - 1]) {
    const altered = Buffer.from(sealed)
    altered[index] ^= 0x01
    assert.equal(openSuccessor(predecessor, predecessorHash, altered), null, String(index))
  }
  assert.equal(openSuccessor(predecessor, predecessorHash, sealed.subarray(0, 29)), null)
  assert.equal(openSuccessor(predecessor, predecessorHash, new Uint8Array()), null)
})
