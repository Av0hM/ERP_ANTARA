import { UploadInterceptor } from "./upload.interceptor";
import { StorageModule } from "../../common/storage/storage.module";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { Module } from "@nestjs/common";

import { PrismaModule } from "../../common/prisma/prisma.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [AuthorizationModule, PrismaModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService, UploadInterceptor],
  exports: [FilesService],
})
export class FilesModule {}
