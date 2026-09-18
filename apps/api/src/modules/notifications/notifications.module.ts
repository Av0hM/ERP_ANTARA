import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationEmailProcessor } from "./processors/notification-email.processor";

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: "notification-email",
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEmailProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
