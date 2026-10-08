import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { Module } from "@nestjs/common";

import { AiConfig } from "../../common/ai/ai.config";
import { AiProvider } from "../../common/ai/ai.provider";
import { OllamaAiProvider } from "../../common/ai/ollama-ai.provider";
import { AiJobsService } from "./ai-jobs.service";
import { AiJobsController } from "./ai-jobs.controller";
import { AiQueueService } from "./ai-queue.service";
import { AiWorkerService } from "./ai-worker.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [AuthorizationModule, PrismaModule],
  providers: [
    AiService,
    AiConfig,
    { provide: AiProvider, useClass: OllamaAiProvider },
    AiJobsService,
    AiQueueService,
    AiWorkerService,
  ],
  controllers: [AiController, AiJobsController],
  exports: [AiService],
})
export class AiModule {}
