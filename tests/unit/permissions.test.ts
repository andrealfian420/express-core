// Purpose: Keep the permission extension point consistent: the role-editor tree (ACCESS_LIST)
//   and the constants used by checkPermission() (PERMISSIONS) name the same unique values.
// Caller: Node unit runner.
// Dependencies: src/modules/role/role.permissions.
// Main Functions: Permission catalogue consistency case.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_LIST,
  ALL_PERMISSIONS,
  PERMISSIONS,
} from '../../src/modules/role/role.permissions'

const leaves = (node: unknown): string[] =>
  typeof node === 'string' ? [node] : Object.values(node as object).flatMap(leaves)

test('permissions: ACCESS_LIST and PERMISSIONS declare the same unique values', () => {
  const constants = leaves(PERMISSIONS)
  assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length, 'duplicate in ACCESS_LIST')
  assert.equal(new Set(constants).size, constants.length, 'duplicate in PERMISSIONS')
  assert.deepEqual([...constants].sort(), [...ALL_PERMISSIONS].sort())
  for (const group of ACCESS_LIST)
    for (const sub of group.sub_module)
      for (const activity of sub.activities)
        assert.match(activity.value, /^module\.[a-z0-9-]+(\.[a-z0-9-]+)+$/, activity.value)
})
