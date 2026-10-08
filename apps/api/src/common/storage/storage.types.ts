import { Readable } from "node:stream";
import { FileCategory, StorageProviderKind } from "@prisma/client";
export interface StorageObject {
  provider: StorageProviderKind;
  objectKey: string;
  bucket: string | null;
}
export interface StorageUpload {
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  key: string;
}
export type StorageAccess =
  | { kind: "url"; url: string; expiresIn: number }
  | { kind: "stream"; stream: Readable };
export interface StorageProvider {
  put(input: StorageUpload): Promise<StorageObject>;
  open(object: StorageObject, name: string): Promise<StorageAccess>;
  remove(object: StorageObject): Promise<void>;
  exists(object: StorageObject): Promise<boolean>;
  inventory(
    cursor?: string,
  ): Promise<{ objects: StorageObject[]; cursor?: string }>;
}
export function providerFor(category: FileCategory): StorageProviderKind {
  return category === "DOCUMENT" || category === "MEETING_REPORT"
    ? "DRIVE"
    : "S3";
}
