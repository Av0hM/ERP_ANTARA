import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { StorageConfig } from "./storage.config";
import { StorageObject, StorageProvider, StorageUpload } from "./storage.types";
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client?: S3Client;
  constructor(private readonly config: StorageConfig) {
    if (config.s3Enabled)
      this.client = new S3Client({
        endpoint: config.required("S3_ENDPOINT"),
        region: config.required("S3_REGION"),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.required("S3_ACCESS_KEY_ID"),
          secretAccessKey: config.required("S3_SECRET_ACCESS_KEY"),
        },
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 10000, requestTimeout: 120000 },
      });
  }
  private ready() {
    if (!this.client)
      throw new ServiceUnavailableException("S3 storage is not configured");
    return this.client;
  }
  private params(object: StorageObject) {
    if (
      object.provider !== "S3" ||
      object.bucket !== this.config.required("S3_BUCKET") ||
      !object.objectKey.startsWith("antara-v1/")
    )
      throw new Error("Storage metadata requires review");
    return { Bucket: object.bucket, Key: object.objectKey };
  }
  async put(input: StorageUpload): Promise<StorageObject> {
    this.ready();
    const object: StorageObject = {
      provider: "S3",
      bucket: this.config.required("S3_BUCKET"),
      objectKey: input.key,
    };
    await this.ready().send(
      new PutObjectCommand({
        ...this.params(object),
        Body: createReadStream(input.path),
        ContentLength: input.sizeBytes,
        ContentType: input.mimeType,
      }),
    );
    return object;
  }
  async open(object: StorageObject, name: string) {
    const url = await getSignedUrl(
      this.ready(),
      new GetObjectCommand({
        ...this.params(object),
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      }),
      { expiresIn: this.config.signedTtl },
    );
    return { kind: "url" as const, url, expiresIn: this.config.signedTtl };
  }
  async remove(object: StorageObject) {
    await this.ready().send(new DeleteObjectCommand(this.params(object)));
  }
  async exists(object: StorageObject) {
    try {
      await this.ready().send(new HeadObjectCommand(this.params(object)));
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        ["NotFound", "NoSuchKey"].includes(error.name)
      )
        return false;
      throw error;
    }
  }
  async inventory(cursor?: string) {
    this.ready();
    const bucket = this.config.required("S3_BUCKET");
    const result = await this.ready().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "antara-v1/",
        MaxKeys: 100,
        ContinuationToken: cursor,
      }),
    );
    return {
      objects: (result.Contents ?? [])
        .filter((v) => v.Key)
        .map((v) => ({ provider: "S3" as const, bucket, objectKey: v.Key! })),
      cursor: result.NextContinuationToken,
    };
  }
}
