import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { WorklogsController } from "./worklogs.controller";
import { WorklogsService } from "./worklogs.service";

@Module({
  imports: [AuthorizationModule, PrismaModule],
  controllers: [WorklogsController],
  providers: [WorklogsService],
  exports: [WorklogsService],
})
export class WorklogsModule {}
