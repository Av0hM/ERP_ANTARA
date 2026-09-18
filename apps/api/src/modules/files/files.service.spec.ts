import { FilesService } from "./files.service";

describe("FilesService", () => {
  const prisma = {
    attachment: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const googleIntegration = {
    uploadDriveFile: jest.fn(),
  };

  const auditService = {
    log: jest.fn().mockResolvedValue(null),
  };

  let service: FilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FilesService(prisma as never, googleIntegration as never, auditService as never);
  });

  it("creates a drive-backed attachment when content is provided", async () => {
    googleIntegration.uploadDriveFile.mockResolvedValue({
      id: "drive-file-1",
      webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
    });
    prisma.attachment.create.mockResolvedValue({
      id: "attachment-1",
      name: "thermal-review.pdf",
      storageUrl: "https://drive.google.com/file/d/drive-file-1/view",
    });

    const result = await service.create({
      name: "thermal-review.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      taskId: "task-1",
      uploadedById: "user-1",
      tags: ["thermal", "review"],
      contentBase64: "cGRm",
    });

    expect(googleIntegration.uploadDriveFile).toHaveBeenCalled();
    expect(prisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driveFileId: "drive-file-1",
          storageUrl: "https://drive.google.com/file/d/drive-file-1/view",
          taskId: "task-1",
          uploadedById: "user-1",
        }),
      }),
    );
    expect(result.id).toBe("attachment-1");
  });

  it("deletes an attachment and logs audit", async () => {
    prisma.attachment.findUnique.mockResolvedValue({
      id: "attachment-1",
      name: "test.pdf",
      taskId: "task-1",
    });
    prisma.attachment.delete.mockResolvedValue({});

    const result = await service.delete("attachment-1", "user-1");

    expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: "attachment-1" } });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "Attachment",
        entityId: "attachment-1",
        actorId: "user-1",
      }),
    );
    expect(result.deleted).toBe(true);
  });
});
