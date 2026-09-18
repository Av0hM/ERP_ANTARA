import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { TaskEventsService } from "./events/task-events.service";
import { TaskCollaborationGateway } from "./gateways/task-collaboration.gateway";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [TasksService, TaskCollaborationGateway, TaskEventsService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
