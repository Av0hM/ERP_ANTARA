import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { SessionService } from "./session.service";
@Module({
  imports: [PrismaModule, ConfigModule, JwtModule.register({})],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
