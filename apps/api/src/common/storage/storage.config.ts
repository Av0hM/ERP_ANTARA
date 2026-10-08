import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
@Injectable()
export class StorageConfig {
  readonly maxBytes: number;
  readonly retentionDays: number;
  readonly signedTtl: number;
  readonly driveEnabled: boolean;
  readonly s3Enabled: boolean;
  constructor(readonly config: ConfigService) {
    this.maxBytes = this.integer(
      "STORAGE_MAX_UPLOAD_BYTES",
      100 * 1024 * 1024,
      1,
      1024 * 1024 * 1024,
    );
    this.retentionDays = this.integer("STORAGE_RETENTION_DAYS", 30, 1, 3650);
    this.signedTtl = this.integer(
      "STORAGE_SIGNED_URL_TTL_SECONDS",
      60,
      10,
      300,
    );
    this.driveEnabled = config.get("STORAGE_DRIVE_ENABLED") === "true";
    this.s3Enabled = config.get("STORAGE_S3_ENABLED") === "true";
    if (this.driveEnabled)
      for (const key of [
        "GOOGLE_DRIVE_ROOT_FOLDER_ID",
        "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        "GOOGLE_PRIVATE_KEY",
      ])
        this.required(key);
    if (this.s3Enabled) {
      for (const key of [
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ])
        this.required(key);
      let endpoint: URL;
      try {
        endpoint = new URL(this.required("S3_ENDPOINT"));
      } catch {
        throw new Error("Invalid S3_ENDPOINT");
      }
      if (
        !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(
          this.required("S3_BUCKET"),
        ) ||
        /\s/.test(this.required("S3_REGION"))
      )
        throw new Error("Invalid S3 bucket or region");
      if (
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        (endpoint.protocol !== "https:" &&
          !(
            endpoint.protocol === "http:" &&
            config.get("NODE_ENV") !== "production" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
          ))
      )
        throw new Error("Invalid S3_ENDPOINT");
    }
  }
  required(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`Missing storage configuration: ${key}`);
    return value;
  }
  private integer(key: string, fallback: number, min: number, max: number) {
    const n = Number(this.config.get(key) ?? fallback);
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw new Error(`Invalid storage configuration: ${key}`);
    return n;
  }
}
