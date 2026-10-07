import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SessionModule } from "../../common/sessions/session.module";
import { WsJwtAuthGuard } from "../auth/guards/ws-jwt-auth.guard";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { TaskEventsService } from "./events/task-events.service";
import { TaskCollaborationGateway } from "./gateways/task-collaboration.gateway";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [
    AuthorizationModule,
    SessionModule,
    PrismaModule,
    AuditModule,
    JwtModule.register({}),
  ],
  providers: [
    WsJwtAuthGuard,
    TasksService,
    TaskCollaborationGateway,
    TaskEventsService,
  ],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
