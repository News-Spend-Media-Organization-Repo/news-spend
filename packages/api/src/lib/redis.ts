import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis() {
  if (client) {
    return client;
  }
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  client = new Redis(url);
  client.on("error", (err) => {
    // keep logging but do not crash the process
    console.error("Redis error:", err);
  });
  return client;
}

export async function disconnectRedis() {
  if (!client) {
    return;
  }
  try {
    await client.quit();
  } catch {
    // ignore
  }
  client = null;
}
