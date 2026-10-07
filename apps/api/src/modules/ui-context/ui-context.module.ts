import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { UiContextController } from "./ui-context.controller";
import { UiContextService } from "./ui-context.service";
@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [UiContextController],
  providers: [UiContextService],
})
export class UiContextModule {}
