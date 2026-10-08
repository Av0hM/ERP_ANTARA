import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { GoogleAuth } from "google-auth-library";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { StorageConfig } from "./storage.config";
import { StorageObject, StorageProvider, StorageUpload } from "./storage.types";
@Injectable()
export class GoogleDriveStorageProvider implements StorageProvider {
  private readonly auth?: GoogleAuth;
  private readonly logger = new Logger(GoogleDriveStorageProvider.name);
  constructor(private readonly config: StorageConfig) {
    if (config.driveEnabled)
      this.auth = new GoogleAuth({
        credentials: {
          client_email: config.required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
          private_key: config
            .required("GOOGLE_PRIVATE_KEY")
            .replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
  }
  private async headers() {
    if (!this.auth)
      throw new ServiceUnavailableException("Drive storage is not configured");
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("Drive authentication unavailable");
    return { Authorization: `Bearer ${token}` };
  }
  private id(object: StorageObject) {
    if (
      object.provider !== "DRIVE" ||
      object.bucket !== null ||
      !/^[\w-]+$/.test(object.objectKey)
    )
      throw new Error("Storage metadata requires review");
    return encodeURIComponent(object.objectKey);
  }
  async put(input: StorageUpload): Promise<StorageObject> {
    const headers = await this.headers();
    const start = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,size",
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": input.mimeType,
          "X-Upload-Content-Length": String(input.sizeBytes),
        },
        body: JSON.stringify({
          name: input.name,
          parents: [this.config.required("GOOGLE_DRIVE_ROOT_FOLDER_ID")],
          appProperties: { antaraStorage: "v1", uploadKey: input.key },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const location = start.headers.get("location");
    if (
      !start.ok ||
      !location ||
      new URL(location).origin !== "https://www.googleapis.com"
    )
      throw new Error("Drive upload initiation failed");
    const response = await fetch(location, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": input.mimeType,
        "Content-Length": String(input.sizeBytes),
      },
      body: Readable.toWeb(
        createReadStream(input.path),
      ) as ReadableStream<Uint8Array>,
      duplex: "half",
      signal: AbortSignal.timeout(120000),
    } as RequestInit & { duplex: string });
    if (!response.ok) throw new Error("Drive upload failed");
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("id" in result) ||
      typeof result.id !== "string" ||
      !/^[\w-]+$/.test(result.id)
    )
      throw new Error("Drive returned invalid metadata");
    const object: StorageObject = {
      provider: "DRIVE",
      bucket: null,
      objectKey: result.id,
    };
    if (!("size" in result) || Number(result.size) !== input.sizeBytes) {
      try {
        await this.remove(object);
      } catch {
        this.logger.error(
          "STORAGE_COMPENSATION_FAILED: provider inventory reconciliation required",
        );
      }
      throw new Error("Drive returned inconsistent size");
    }
    return object;
  }
  async open(object: StorageObject) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${this.id(object)}?alt=media&supportsAllDrives=true`,
      { headers: await this.headers(), signal: AbortSignal.timeout(120000) },
    );
    if (!response.ok || !response.body)
      throw new Error("Drive download unavailable");
    return {
      kind: "stream" as const,
      stream: Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream<Uint8Array>,
      ),
    };
  }
  async remove(object: StorageObject) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${this.id(object)}?supportsAllDrives=true`,
      {
        method: "DELETE",
        headers: await this.headers(),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok && response.status !== 404)
      throw new Error("Drive deletion failed");
  }
  async exists(object: StorageObject) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${this.id(object)}?fields=id,trashed&supportsAllDrives=true`,
      { headers: await this.headers(), signal: AbortSignal.timeout(30000) },
    );
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Drive metadata unavailable");
    const data: unknown = await response.json();
    return (
      !!data &&
      typeof data === "object" &&
      "trashed" in data &&
      data.trashed === false
    );
  }
  async inventory(cursor?: string) {
    const query = new URLSearchParams({
      q: "appProperties has { key='antaraStorage' and value='v1' } and trashed=false",
      fields: "files(id),nextPageToken",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(cursor ? { pageToken: cursor } : {}),
    });
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${query}`,
      { headers: await this.headers(), signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw new Error("Drive inventory unavailable");
    const data = (await response.json()) as {
      files?: { id: string }[];
      nextPageToken?: string;
    };
    return {
      objects: (data.files ?? []).map((file) => ({
        provider: "DRIVE" as const,
        bucket: null,
        objectKey: file.id,
      })),
      cursor: data.nextPageToken,
    };
  }
}
