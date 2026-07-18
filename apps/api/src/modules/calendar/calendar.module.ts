import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { GoogleIntegrationService } from "../../common/integrations/google.integration.service";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

@Module({
  imports: [PrismaModule],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleIntegrationService],
  exports: [CalendarService],
})
export class CalendarModule {}
