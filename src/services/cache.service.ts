// Purpose: Thin JSON cache over Redis so business logic never calls ioredis directly: strings
//   (get/mget/set/del/incr) and sets (sadd/smembers/srem) used for RBAC/profile caching and
//   invalidation.
// Caller: rbac-cache.service, profile/user/role/auth services, email.processor (sent marker).
// Dependencies: ioredis singleton (src/config/redis.ts).
// Main Functions: get, mget, set, del, incr, sadd, smembers, srem.
// Side Effects: Reads, writes and deletes Redis keys.
import redis from '../config/redis'

// This service provides a simple interface for interacting with Redis, allowing you to get, set, and delete cached data.
// It abstracts away the details of how Redis is used, making it easier to implement caching in your application
// without having to deal with Redis directly in your business logic.
class CacheService {
  // retrieves a value from Redis by key, parses it from JSON, and returns it. If the key does not exist, it returns null
  // The generic type <T> allows the caller to specify the expected type of the returned value, providing type safety when using the cache
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key)

    if (!data) {
      return null
    }

    return JSON.parse(data)
  }

  // Reads several keys in one round trip; each value is parsed like get() (null when missing).
  async mget<T extends unknown[]>(...keys: string[]): Promise<{ [K in keyof T]: T[K] | null }> {
    const values = await redis.mget(...keys)
    return values.map((value) => (value ? JSON.parse(value) : null)) as {
      [K in keyof T]: T[K] | null
    }
  }

  // Atomically increments an integer counter (created at 1, no expiry) and returns it.
  async incr(key: string): Promise<number> {
    return await redis.incr(key)
  }

  // stores a value in Redis under the specified key,
  // with an optional time-to-live (TTL) in seconds. The value is stringified to JSON before being stored
  async set<T>(key: string, value: T, ttl: number = 60): Promise<void> {
    await redis.set(key, JSON.stringify(value), 'EX', ttl)
  }

  // Deletes one or more keys in a single round trip; no-op without keys.
  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await redis.del(...keys)
  }

  // sadd is a Redis command that stands for "Set Add". It is used to add a member to a set stored at a specified key in Redis.
  // This is useful for maintaining collections of related items, such as user IDs associated with a particular role.
  // The member is added to the set, and if the set does not exist, it will be created automatically
  async sadd(key: string, member: string | number, ttl: number = 60): Promise<void> {
    await redis.sadd(key, member)
    await redis.expire(key, ttl)
  }

  // smembers is a Redis command that stands for "Set Members".
  // It is used to retrieve all the members of a set stored at a specified key in Redis.
  // This is useful for retrieving collections of related items, such as all user IDs associated with a particular role.
  // It returns an array of members in the set
  async smembers(key: string): Promise<string[]> {
    return await redis.smembers(key)
  }

  // Removes only the given members. Unlike del() on the whole set, members added concurrently
  // (after the caller read the set) stay tracked. Returns the number removed; no-op when empty.
  async srem(key: string, members: (string | number)[]): Promise<number> {
    if (members.length === 0) return 0
    return await redis.srem(key, ...members.map(String))
  }
}

export default new CacheService()
