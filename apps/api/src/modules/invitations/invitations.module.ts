import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SessionModule } from "../../common/sessions/session.module";
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { InvitationEmailProcessor } from "./processors/invitation-email.processor";

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    SessionModule,
    AuditModule,
    BullModule.registerQueue({
      name: "invitation-email",
    }),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationEmailProcessor],
  exports: [InvitationsService],
})
export class InvitationsModule {}
