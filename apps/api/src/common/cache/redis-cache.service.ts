import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>("redis.url");
    if (!url) {
      return;
    }

    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

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
}
