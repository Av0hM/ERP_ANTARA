import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthorizationService } from "./authorization.service";

/** Deliberately not global and not imported by existing feature/root modules in Phase 1B. */
@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
