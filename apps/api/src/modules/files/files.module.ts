import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { GoogleIntegrationService } from "../../common/integrations/google.integration.service";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [PrismaModule],
  controllers: [FilesController],
  providers: [FilesService, GoogleIntegrationService],
  exports: [FilesService],
})
export class FilesModule {}
