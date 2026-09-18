import { Module } from "@nestjs/common";

import { OpenAiIntegrationService } from "../../common/integrations/openai.integration.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [PrismaModule],
  providers: [AiService, OpenAiIntegrationService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
