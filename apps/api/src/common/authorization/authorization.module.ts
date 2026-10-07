import { CoreAuthorizationService } from "./core-authorization.service";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthorizationService } from "./authorization.service";

/** Explicit imports only; Phase 4A activates selected core surfaces. */
@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService, CoreAuthorizationService],
  exports: [AuthorizationService, CoreAuthorizationService],
})
export class AuthorizationModule {}
