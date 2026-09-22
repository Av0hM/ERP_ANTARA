import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  const isTls = url.protocol === "rediss:";

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || "default",
    password: url.password || undefined,
    tls: isTls ? {} : undefined,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  };
}

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>("redis.url");
    if (!redisUrl) {
      return;
    }

    const client = new Redis(parseRedisUrl(redisUrl));

    client.on("error", () => {
      // Cache is best-effort. The API continues without Redis if the cache is unavailable.
    });

    try {
      await client.connect();
      this.client = client;
    } catch {
      client.disconnect();
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  async getJson<T>(key: string) {
    if (!this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 300) {
    if (!this.client) {
      return;
    }

    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Cache writes are non-blocking by design.
    }
  }

  async del(key: string) {
    if (!this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch {
      // Ignore cache eviction failures.
    }
  }

  async ping(): Promise<string> {
    if (!this.client) {
      throw new Error("Redis client not initialized");
    }
    return this.client.ping();
  }
}
