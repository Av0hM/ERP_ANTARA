import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { StorageConfig } from "../src/common/storage/storage.config";
import { StorageRouter } from "../src/common/storage/storage.router";
import { GoogleDriveStorageProvider } from "../src/common/storage/google-drive-storage.provider";
import { S3StorageProvider } from "../src/common/storage/s3-storage.provider";
import { StorageProvider } from "../src/common/storage/storage.types";
interface LegacyDouble {
  isDriveConfigured(): boolean;
  uploadDriveFile(input: {
    name: string;
    mimeType: string;
    contentBase64: string;
  }): Promise<{ id: string } | null>;
  deleteDriveFile(id: string): Promise<unknown>;
}
/** Offline boundary only. Existing privacy tests retain their failure-injection hooks. */
export function storageFixture(legacy?: LegacyDouble) {
  const config = new StorageConfig(
    new ConfigService({
      STORAGE_DRIVE_ENABLED: "false",
      STORAGE_S3_ENABLED: "false",
      STORAGE_MAX_UPLOAD_BYTES: "1024",
    }),
  );
  const drive = new GoogleDriveStorageProvider(config),
    s3 = new S3StorageProvider(config);
  const objects = new Set<string>();
  const legacyIds = new Map<string, string>();
  const router = new StorageRouter(drive, s3);
  const providers: [StorageProvider, "DRIVE" | "S3"][] = [
    [drive, "DRIVE"],
    [s3, "S3"],
  ];
  for (const [provider, kind] of providers) {
    provider.put = jest.fn(async (input) => {
      if (legacy && !legacy.isDriveConfigured())
        throw new ServiceUnavailableException("Storage not configured");
      const result = legacy
        ? await legacy.uploadDriveFile({
            name: input.name,
            mimeType: input.mimeType,
            contentBase64: (await readFile(input.path)).toString("base64"),
          })
        : { id: input.key.replaceAll("/", "-") };
      if (!result?.id) throw new Error("Provider identity missing");
      const key = kind === "DRIVE" ? result.id : input.key;
      objects.add(key);
      legacyIds.set(key, result.id);
      return {
        provider: kind,
        objectKey: key,
        bucket: kind === "S3" ? "fixture-bucket" : null,
      };
    });
    provider.remove = jest.fn(async (object) => {
      if (legacy)
        await legacy.deleteDriveFile(
          legacyIds.get(object.objectKey) ?? object.objectKey,
        );
      objects.delete(object.objectKey);
    });
    provider.exists = jest.fn(async (object) => objects.has(object.objectKey));
    provider.open = jest.fn(async (object) => ({
      kind: "stream" as const,
      stream: Readable.from(["fixture"]),
    }));
    provider.inventory = jest.fn(async () => ({
      objects: [...objects].map((objectKey) => ({
        provider: kind,
        objectKey,
        bucket: kind === "S3" ? "fixture-bucket" : null,
      })),
    }));
  }
  return { config, router, drive, s3, objects };
}
