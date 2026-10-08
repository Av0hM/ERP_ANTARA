import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { FileCategory, StorageProviderKind } from "@prisma/client";
import { GoogleDriveStorageProvider } from "./google-drive-storage.provider";
import { S3StorageProvider } from "./s3-storage.provider";
import { providerFor, StorageProvider } from "./storage.types";
@Injectable()
export class StorageRouter {
  constructor(
    private readonly drive: GoogleDriveStorageProvider,
    private readonly s3: S3StorageProvider,
  ) {}
  provider(kind: StorageProviderKind): StorageProvider {
    return kind === "DRIVE" ? this.drive : this.s3;
  }
  forCategory(category: FileCategory) {
    return this.provider(providerFor(category));
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Storage operation failed; retry or contact an administrator",
      });
    }
  }
}
