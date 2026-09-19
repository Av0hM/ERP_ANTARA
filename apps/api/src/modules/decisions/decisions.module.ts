import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { DecisionsController } from "./decisions.controller";
import { DecisionsService } from "./decisions.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DecisionsController],
  providers: [DecisionsService],
  exports: [DecisionsService],
})
export class DecisionsModule {}