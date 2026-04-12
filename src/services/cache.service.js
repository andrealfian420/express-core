const redis = require('../config/redis')

// This service provides a simple interface for interacting with Redis, allowing you to get, set, and delete cached data. 
// It abstracts away the details of how Redis is used, making it easier to implement caching in your application 
// without having to deal with Redis directly in your business logic.
class CacheService {
  // retrieves a value from Redis by key, parses it from JSON, and returns it. If the key does not exist, it returns null
  async get(key) {
    const data = await redis.get(key)

    if (!data) {
      return null
    }

    return JSON.parse(data)
  }

  // stores a value in Redis under the specified key,
  // with an optional time-to-live (TTL) in seconds. The value is stringified to JSON before being stored
  async set(key, value, ttl = 60) {
    await redis.set(key, JSON.stringify(value), 'EX', ttl)
  }

  // deletes a value from Redis by key
  async del(key) {
    await redis.del(key)
  }
}

module.exports = new CacheService()
