import { ConfigService } from "@nestjs/config";
import { GoogleAuth } from "google-auth-library";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageConfig } from "./storage.config";
import { S3StorageProvider } from "./s3-storage.provider";
import { GoogleDriveStorageProvider } from "./google-drive-storage.provider";
import { inspectUpload } from "./upload-safety";
const configValues = {
  STORAGE_S3_ENABLED: "true",
  STORAGE_DRIVE_ENABLED: "true",
  S3_ENDPOINT: "https://storage.fixture.invalid",
  S3_REGION: "auto",
  S3_BUCKET: "only-bucket",
  S3_ACCESS_KEY_ID: "fixture-id",
  S3_SECRET_ACCESS_KEY: "fixture-secret",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "storage@fixture.invalid",
  GOOGLE_PRIVATE_KEY: "fixture-key",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "fixture-folder",
};
describe("Storage provider protocol boundaries (offline)", () => {
  afterEach(() => jest.restoreAllMocks());
  it("S3 signs private downloads for 60 seconds in one configured bucket without network", async () => {
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network"));
    const provider = new S3StorageProvider(
      new StorageConfig(new ConfigService(configValues)),
    );
    const access = await provider.open(
      {
        provider: "S3",
        bucket: "only-bucket",
        objectKey: "antara-v1/cad/uuid",
      },
      "part.step",
    );
    const url = new URL(access.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
    expect(url.pathname).toBe("/only-bucket/antara-v1/cad/uuid");
    expect(access.url).not.toContain("fixture-secret");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("S3 refuses another bucket or arbitrary legacy key", async () => {
    const provider = new S3StorageProvider(
      new StorageConfig(new ConfigService(configValues)),
    );
    await expect(
      provider.open(
        { provider: "S3", bucket: "other", objectKey: "antara-v1/x" },
        "x",
      ),
    ).rejects.toThrow("review");
    await expect(
      provider.open(
        { provider: "S3", bucket: "only-bucket", objectKey: "legacy/x" },
        "x",
      ),
    ).rejects.toThrow("review");
  });
  it("actual filesystem size, not caller metadata, enforces bounds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "antara-size-"));
    try {
      const file = join(dir, "file");
      await writeFile(file, "12345");
      expect(await inspectUpload(file, 5)).toBe(5);
      await expect(inspectUpload(file, 4)).rejects.toThrow("limit");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("Drive upload uses resumable streaming and returns provider identity without public sharing", async () => {
    jest
      .spyOn(GoogleAuth.prototype, "getAccessToken")
      .mockResolvedValue("fixture-token");
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { location: "https://www.googleapis.com/upload/session" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "drive-id", size: "3" }), {
          status: 200,
        }),
      );
    const dir = await mkdtemp(join(tmpdir(), "antara-drive-"));
    try {
      const file = join(dir, "file");
      await writeFile(file, "abc");
      const provider = new GoogleDriveStorageProvider(
        new StorageConfig(new ConfigService(configValues)),
      );
      const object = await provider.put({
        path: file,
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        key: "antara-v1/document/uuid",
      });
      expect(object).toEqual({
        provider: "DRIVE",
        objectKey: "drive-id",
        bucket: null,
      });
      expect(fetch.mock.calls[0]![1]?.body).toContain("antaraStorage");
      expect(fetch.mock.calls[1]![1]?.body).not.toBeInstanceOf(Buffer);
      expect(
        fetch.mock.calls.some((call) =>
          String(call[0]).includes("permissions"),
        ),
      ).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("Drive does not forward credentials to an untrusted upload location", async () => {
    jest
      .spyOn(GoogleAuth.prototype, "getAccessToken")
      .mockResolvedValue("fixture-token");
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { location: "https://evil.invalid/upload" },
      }),
    );
    const provider = new GoogleDriveStorageProvider(
      new StorageConfig(new ConfigService(configValues)),
    );
    await expect(
      provider.put({
        path: "/not-read",
        name: "a",
        mimeType: "text/plain",
        sizeBytes: 1,
        key: "key",
      }),
    ).rejects.toThrow("initiation");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("Drive opens via authenticated media stream and never returns a provider view link", async () => {
    jest
      .spyOn(GoogleAuth.prototype, "getAccessToken")
      .mockResolvedValue("fixture-token");
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("bytes", { status: 200 }));
    const provider = new GoogleDriveStorageProvider(
      new StorageConfig(new ConfigService(configValues)),
    );
    const access = await provider.open({
      provider: "DRIVE",
      objectKey: "drive-id",
      bucket: null,
    });
    expect(access.kind).toBe("stream");
    access.stream.destroy();
    expect(String(fetch.mock.calls[0]![0])).toContain("alt=media");
    expect(access).not.toHaveProperty("url");
  });
  it("Drive missing/trashed content is not restorable", async () => {
    jest
      .spyOn(GoogleAuth.prototype, "getAccessToken")
      .mockResolvedValue("fixture-token");
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "id", trashed: true }), {
          status: 200,
        }),
      );
    const provider = new GoogleDriveStorageProvider(
      new StorageConfig(new ConfigService(configValues)),
    );
    const object = {
      provider: "DRIVE" as const,
      objectKey: "id",
      bucket: null,
    };
    expect(await provider.exists(object)).toBe(false);
    expect(await provider.exists(object)).toBe(false);
  });
});
