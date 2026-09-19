import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { AiModule } from "../ai/ai.module";
import { CalendarModule } from "../calendar/calendar.module";
import { TasksModule } from "../tasks/tasks.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PrismaModule, AuditModule, AiModule, CalendarModule, TasksModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}