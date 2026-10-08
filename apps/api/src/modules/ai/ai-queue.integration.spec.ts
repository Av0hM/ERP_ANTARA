import { ConfigService } from "@nestjs/config";
import { Worker, QueueEvents } from "bullmq";
import { AiConfig } from "../../common/ai/ai.config";
import { AiQueueService } from "./ai-queue.service";
const raw = process.env.AI_TEST_REDIS_URL;
if (process.env.AI_REQUIRE_DB === "true" && !raw)
  throw new Error("AI_TEST_REDIS_URL required");
(raw ? describe : describe.skip)("isolated Redis BullMQ execution", () => {
  let queue: AiQueueService, worker: Worker, events: QueueEvents;
  const calls = new Map<string, number>();
  beforeAll(async () => {
    const url = new URL(raw!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55462" ||
      url.pathname !== "/15"
    )
      throw new Error("Dedicated local Redis fixture required");
    // This isolated server is used only by Phase 7, never the app's configured Redis.
    const config = new ConfigService({
      AI_ENABLED: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:1",
      OLLAMA_MODEL: "fixture",
      AI_RETRY_BASE_DELAY_MS: "1000",
      AI_MAX_RETRIES: "1",
      REDIS_URL: raw,
    });
    queue = new AiQueueService(config, new AiConfig(config));
    const connection = { ...queue.connection!, maxRetriesPerRequest: null };
    events = new QueueEvents("ai-generation", { connection });
    await events.waitUntilReady();
    worker = new Worker<{ jobId: string }>(
      "ai-generation",
      async (job) => {
        const count = (calls.get(job.id!) ?? 0) + 1;
        calls.set(job.id!, count);
        if (job.data.jobId.includes("fail") || count === 1)
          throw new Error("PROVIDER_UNAVAILABLE");
      },
      { connection },
    );
    await worker.waitUntilReady();
  });
  afterAll(async () => {
    await worker?.close();
    await events?.close();
    await queue?.onModuleDestroy();
  });
  async function terminal(id: string) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const state = await queue.state(id);
      if (["failed", "completed"].includes(state)) return state;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Fixture execution timed out");
  }
  it("deduplicates queue IDs and retries transient execution with bounded backoff", async () => {
    const id = `retry-${process.pid}-${Date.now()}`;
    const started = Date.now();
    await queue.enqueue(id);
    await queue.enqueue(id);
    expect(await terminal(id)).toBe("completed");
    expect(calls.get(id)).toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });
  it("exhausted execution becomes terminal, never infinite", async () => {
    const id = `fail-${process.pid}-${Date.now()}`;
    await queue.enqueue(id);
    expect(await terminal(id)).toBe("failed");
    expect(calls.get(id)).toBe(2);
  });
  it("detects absent execution entries without scheduling anything", async () =>
    expect(await queue.state("missing-fixture-id")).toBe("missing"));
});
