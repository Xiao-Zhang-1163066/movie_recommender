import Redis from "ioredis";

let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    // Fail fast on connection issues rather than blocking requests
    connectTimeout: 2000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    console.error("Redis error:", err.message);
  });
}

// Wrap get/set/del so callers don't need to null-check redis everywhere.
// If REDIS_URL is not set (e.g. local dev), all calls are silent no-ops.
export const cache = {
  async get(key) {
    if (!redis) return null;
    try {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  },

  async set(key, value, ttlSeconds = 300) {
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // cache write failure is non-fatal
    }
  },

  async del(...keys) {
    if (!redis) return;
    try {
      await redis.del(...keys);
    } catch {
      // cache invalidation failure is non-fatal
    }
  },
};
