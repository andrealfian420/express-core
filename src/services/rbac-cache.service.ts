// Purpose: Versioned cache of each user's role and permissions for the RBAC middleware. A
//   global version counter is bumped after every committed change that can alter someone's
//   access; cached entries stamped with an older version are ignored.
// Caller: rbac.middleware (read/write), role.service and user.service (invalidateAccess after
//   commit).
// Dependencies: cache.service (Redis).
// Main Functions: readUserAccess, cacheUserAccess, invalidateAccess, RBAC_VERSION_KEY,
//   USER_ROLE_CACHE_TTL.
// Side Effects: Redis reads/writes of `user-role:<userId>`, `role-users:<roleId>` and
//   `rbac:version`.
// Notes: Deleting keys alone cannot stop a request that read the database before a change
//   from caching that old state after the deletion. Reading the version together with the
//   entry, BEFORE the database read, and stamping it on the write closes that window: such a
//   write carries the pre-change version and is treated as a miss on the next request.
import cacheService from './cache.service'
import { CachedUserData } from '../types/express'

export const RBAC_VERSION_KEY = 'rbac:version'
export const USER_ROLE_CACHE_TTL = 300 // 5 minutes

const userKey = (userId: number) => `user-role:${userId}`

// One round trip: the cached entry (if still current) and the version to stamp on a refill.
export async function readUserAccess(
  userId: number,
): Promise<{ cached: CachedUserData | null; version: number }> {
  const [entry, stored] = await cacheService.mget<[CachedUserData, number]>(
    userKey(userId),
    RBAC_VERSION_KEY,
  )
  const version = stored ?? 0
  return {
    cached: entry && entry.rbacVersion === version ? entry : null,
    version,
  }
}

// `version` must be the value readUserAccess returned before the database read.
export async function cacheUserAccess(
  userId: number,
  data: CachedUserData,
  version: number,
): Promise<void> {
  await cacheService.set(userKey(userId), { ...data, rbacVersion: version }, USER_ROLE_CACHE_TTL)
  if (data.role) {
    // Tracks the role's users so a role change can also drop their cached profiles.
    await cacheService.sadd(`role-users:${data.role.id}`, userId, USER_ROLE_CACHE_TTL)
  }
}

// Call after the change has committed: every entry cached before this point stops counting.
export async function invalidateAccess(): Promise<void> {
  await cacheService.incr(RBAC_VERSION_KEY)
}
