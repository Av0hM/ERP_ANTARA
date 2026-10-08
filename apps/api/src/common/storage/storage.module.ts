import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorageConfig } from "./storage.config";
import { StorageRouter } from "./storage.router";
import { GoogleDriveStorageProvider } from "./google-drive-storage.provider";
import { S3StorageProvider } from "./s3-storage.provider";
@Module({
  imports: [ConfigModule],
  providers: [
    StorageConfig,
    StorageRouter,
    GoogleDriveStorageProvider,
    S3StorageProvider,
  ],
  exports: [StorageConfig, StorageRouter],
})
export class StorageModule {}
