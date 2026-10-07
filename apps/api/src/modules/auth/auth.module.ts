import { RefreshThrottleGuard } from "./refresh-throttle.guard";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { SessionModule } from "../../common/sessions/session.module";
import { GoogleIdentityService } from "./google-identity.service";
import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    PrismaModule,
    SessionModule,
    AuditModule,
    PassportModule,
    JwtModule.register({}),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleIdentityService,
    RefreshThrottleGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
