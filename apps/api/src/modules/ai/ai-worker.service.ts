import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Worker } from "bullmq";
import { AiConfig } from "../../common/ai/ai.config";
import { AiJobsService } from "./ai-jobs.service";
import { AiQueueService } from "./ai-queue.service";

@Injectable()
export class AiWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private readonly logger = new Logger(AiWorkerService.name);
  constructor(
    private readonly jobs: AiJobsService,
    private readonly queue: AiQueueService,
    private readonly config: AiConfig,
  ) {}
  onModuleInit() {
    if (
      !this.config.enabled ||
      !this.config.workerEnabled ||
      !this.queue.connection
    )
      return;
    this.worker = new Worker<{ jobId: string }>(
      "ai-generation",
      (job) => this.jobs.execute(job.data.jobId),
      {
        connection: { ...this.queue.connection, maxRetriesPerRequest: null },
        concurrency: 1,
        autorun: false,
      },
    );
    this.worker.on("error", () => this.logger.warn("AI_WORKER_UNAVAILABLE"));
    // Optional worker connectivity must not delay application startup.
    void this.worker
      .run()
      .catch(() => this.logger.warn("AI_WORKER_UNAVAILABLE"));
  }
  async onModuleDestroy() {
    await this.worker?.close();
  }
}
