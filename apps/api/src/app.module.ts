import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { CacheModule } from "./common/cache/cache.module";
import { appConfig } from "./common/config/app.config";
import { AppController } from "./app.controller";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AiModule } from "./modules/ai/ai.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { DecisionsModule } from "./modules/decisions/decisions.module";
import { FilesModule } from "./modules/files/files.module";
import { MeetingsModule } from "./modules/meetings/meetings.module";
import { MetricsModule } from "./modules/metrics/metrics.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { SubsystemsModule } from "./modules/subsystems/subsystems.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { UsersModule } from "./modules/users/users.module";
import { WorklogsModule } from "./modules/worklogs/worklogs.module";
import { HealthModule } from "./modules/health/health.module";
import { SwaggerModule } from "./modules/swagger/swagger.module";
import { InvitationsModule } from "./modules/invitations/invitations.module";

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
    AuditModule,
    DecisionsModule,
    MeetingsModule,
    ResourcesModule,
    ReportsModule,
    HealthModule,
    MetricsModule,
    SwaggerModule,
    InvitationsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}