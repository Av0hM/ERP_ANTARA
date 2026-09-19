import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { CalendarModule } from "../calendar/calendar.module";
import { TasksModule } from "../tasks/tasks.module";
import { AiModule } from "../ai/ai.module";
import { MeetingsController } from "./meetings.controller";
import { MeetingAutomationService } from "./meetings.service";

@Module({
  imports: [PrismaModule, CalendarModule, TasksModule, AiModule],
  controllers: [MeetingsController],
  providers: [MeetingAutomationService],
  exports: [MeetingAutomationService],
})
export class MeetingsModule {}