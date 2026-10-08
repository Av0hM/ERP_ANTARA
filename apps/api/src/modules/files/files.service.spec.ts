import { fixtureCore } from "../../../test/authorization.fixture";
import { storageFixture } from "../../../test/storage.fixture";
import { FilesService } from "./files.service";
import { FileCategory } from "@prisma/client";
import { providerFor } from "../../common/storage/storage.types";
import {
  contentType,
  objectKey,
  sanitizeFilename,
} from "../../common/storage/upload-safety";
import { StorageConfig } from "../../common/storage/storage.config";
import { ConfigService } from "@nestjs/config";

describe("Phase 6 storage foundation", () => {
  it.each([
    ["DOCUMENT", "DRIVE"],
    ["MEETING_REPORT", "DRIVE"],
    ["CAD", "S3"],
    ["IMAGE", "S3"],
    ["EXPORT", "S3"],
    ["OTHER", "S3"],
  ] as const)("%s routes to %s", (category, provider) =>
    expect(providerFor(category)).toBe(provider),
  );
  it("sanitizes traversal, control characters and empty names", () => {
    expect(sanitizeFilename("../../a\\b\r\n.pdf")).toBe("b__.pdf");
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename("..／part.step")).toBe("part.step");
  });
  it("object keys use generated identity, not a filename", () => {
    expect(objectKey("CAD")).toMatch(/^antara-v1\/cad\/[a-f0-9-]+$/);
    expect(objectKey("CAD")).not.toBe(objectKey("CAD"));
  });
  it("validates content type without trusting active content for inline rendering", () => {
    expect(contentType("text/html\r\nx:bad")).toBe("application/octet-stream");
    expect(contentType("IMAGE/PNG")).toBe("image/png");
  });
  it.each([
    "S3_ENDPOINT",
    "STORAGE_MAX_UPLOAD_BYTES",
    "STORAGE_SIGNED_URL_TTL_SECONDS",
    "STORAGE_RETENTION_DAYS",
  ])("invalid config %s fails at boot", (key) => {
    expect(
      () =>
        new StorageConfig(
          new ConfigService({ STORAGE_S3_ENABLED: "true", [key]: "invalid" }),
        ),
    ).toThrow();
  });
  it("disabled providers and secure lifecycle defaults are explicit", () => {
    const config = new StorageConfig(new ConfigService());
    expect(config.signedTtl).toBe(60);
    expect(config.retentionDays).toBe(30);
    expect(config.maxBytes).toBe(104857600);
    expect(config.driveEnabled).toBe(false);
  });
  it("production rejects non-TLS S3", () => {
    expect(
      () =>
        new StorageConfig(
          new ConfigService({
            NODE_ENV: "production",
            STORAGE_S3_ENABLED: "true",
            S3_ENDPOINT: "http://127.0.0.1",
            S3_REGION: "auto",
            S3_BUCKET: "one",
            S3_ACCESS_KEY_ID: "fixture",
            S3_SECRET_ACCESS_KEY: "fixture",
          }),
        ),
    ).toThrow("S3_ENDPOINT");
  });
  async function setup() {
    const attachment = {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    };
    const fixture = await fixtureCore({ attachment });
    const storage = storageFixture();
    const service = new FilesService(
      fixture.prisma,
      storage.router,
      storage.config,
      fixture.core,
    );
    attachment.create.mockImplementation(
      async ({ data }: { data: object }) => ({
        id: "file",
        ...data,
        task: null,
        uploadedBy: { id: "owner", name: "Owner" },
      }),
    );
    return { service, attachment, ...storage, ...fixture };
  }
  const input = {
    name: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 999,
    contentBase64: Buffer.from("real content").toString("base64"),
  };
  it("actual bytes, authenticated actor and provider identity persist without public URL", async () => {
    const f = await setup();
    const crafted = { ...input, uploadedById: "spoof" };
    const file = await f.service.create(crafted, "owner");
    expect(file.sizeBytes).toBe(12);
    expect(file.uploadedById).toBe("owner");
    expect(file.provider).toBe("DRIVE");
    expect(file).not.toHaveProperty("objectKey");
    expect(file).not.toHaveProperty("storageUrl");
    expect(f.db.auditLog.create).toHaveBeenCalled();
  });
  it("provider failure creates no metadata", async () => {
    const f = await setup();
    jest.mocked(f.drive.put).mockRejectedValueOnce(new Error("secret"));
    await expect(f.service.create(input, "owner")).rejects.toThrow(
      "Storage operation failed",
    );
    expect(f.attachment.create).not.toHaveBeenCalled();
  });
  it("DB failure compensates and cleanup failure cannot become success", async () => {
    const f = await setup();
    f.attachment.create.mockRejectedValue(new Error("db unavailable"));
    jest.mocked(f.drive.remove).mockRejectedValue(new Error("cleanup failure"));
    await expect(f.service.create(input, "owner")).rejects.toThrow(
      "db unavailable",
    );
    expect(f.drive.remove).toHaveBeenCalled();
  });
  it("oversized compatibility payload is rejected", async () => {
    const f = await setup();
    await expect(
      f.service.create(
        { ...input, contentBase64: "a".repeat(1400001) },
        "owner",
      ),
    ).rejects.toThrow("multipart");
    expect(f.drive.put).not.toHaveBeenCalled();
  });
  it("missing content cannot create a fake file", async () => {
    const f = await setup();
    await expect(
      f.service.create({ ...input, contentBase64: undefined }, "owner"),
    ).rejects.toThrow("content");
    expect(f.attachment.create).not.toHaveBeenCalled();
  });
});
