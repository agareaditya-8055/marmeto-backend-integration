import { createRedisConnection } from "../src/config/redis";

async function testRedis() {
  const redis = createRedisConnection();

  try {
    const result = await redis.ping();
    console.log("Redis connection successful:", result);
  } catch (error) {
    console.error("Redis connection failed:", error);
    process.exitCode = 1;
  } finally {
    await redis.quit();
  }
}

void testRedis();