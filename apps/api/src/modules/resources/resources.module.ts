import { TasksModule } from "../tasks/tasks.module";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { ResourcesController } from "./resources.controller";
import { ResourcesService } from "./resources.service";

@Module({
  imports: [AuthorizationModule, TasksModule, PrismaModule, AiModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
