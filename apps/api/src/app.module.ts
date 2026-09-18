import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { CacheModule } from "./common/cache/cache.module";
import { appConfig } from "./common/config/app.config";
import { AppController } from "./app.controller";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AiModule } from "./modules/ai/ai.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { FilesModule } from "./modules/files/files.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SubsystemsModule } from "./modules/subsystems/subsystems.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { UsersModule } from "./modules/users/users.module";
import { WorklogsModule } from "./modules/worklogs/worklogs.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    CacheModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuthModule,
    UsersModule,
    TasksModule,
    AnalyticsModule,
    AiModule,
    NotificationsModule,
    SubsystemsModule,
    CalendarModule,
    WorklogsModule,
    FilesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
