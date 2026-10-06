import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { SessionModule } from "../../common/sessions/session.module";
import { AccountLifecycleService } from "./account-lifecycle.service";
import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PrismaModule, AuditModule, AuthorizationModule, SessionModule],
  controllers: [UsersController],
  providers: [UsersService, AccountLifecycleService],
  exports: [UsersService],
})
export class UsersModule {}
