import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { SubsystemsController } from "./subsystems.controller";
import { SubsystemsService } from "./subsystems.service";

@Module({
  imports: [PrismaModule],
  controllers: [SubsystemsController],
  providers: [SubsystemsService],
  exports: [SubsystemsService],
})
export class SubsystemsModule {}
