import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { AiConfig } from "../../common/ai/ai.config";
import { AiFailure } from "../../common/ai/ai.provider";

@Injectable()
export class AiQueueService implements OnModuleDestroy {
  private queue?: Queue<{ jobId: string }>;
  readonly connection;
  constructor(
    config: ConfigService,
    private readonly ai: AiConfig,
  ) {
    const raw =
      config.get<string>("redis.url") ?? config.get<string>("REDIS_URL");
    if (ai.enabled && raw) {
      const url = new URL(raw);
      if (!["redis:", "rediss:"].includes(url.protocol))
        throw new Error("Invalid AI Redis configuration");
      const db = Number(url.pathname.slice(1) || "0");
      if (!Number.isInteger(db) || db < 0 || db > 15)
        throw new Error("Invalid AI Redis database");
      this.connection = {
        db,
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
      };
      this.queue = new Queue("ai-generation", {
        connection: {
          ...this.connection,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 2000,
        },
      });
      this.queue.on("error", () => {
        /* Sanitized failure is reported by submission/reconciliation. */
      });
    }
  }
  async enqueue(jobId: string) {
    if (!this.queue) throw new AiFailure("QUEUE_UNAVAILABLE");
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.queue.add(
          "generate",
          { jobId },
          {
            jobId,
            attempts: this.ai.maxAttempts,
            backoff: { type: "exponential", delay: this.ai.retryDelayMs },
            removeOnComplete: 1000,
            removeOnFail: 1000,
          },
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AiFailure("QUEUE_UNAVAILABLE")),
            3000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async state(id: string) {
    if (!this.queue) return "unavailable";
    try {
      return (await (await this.queue.getJob(id))?.getState()) ?? "missing";
    } catch {
      return "unavailable";
    }
  }
  async onModuleDestroy() {
    await this.queue?.close();
  }
}
