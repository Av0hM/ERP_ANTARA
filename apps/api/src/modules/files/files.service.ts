import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Attachment, FileCategory, Prisma } from "@prisma/client";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { ActorContext } from "../../common/authorization/authorization.types";
import {
  canManageSubsystem,
  canReadSubsystem,
} from "../../common/authorization/authorization.policy";
import { lockAccounts } from "../../common/sessions/session.service";
import { safeUserSelect } from "../../common/prisma/safe-user.select";
import { StorageRouter } from "../../common/storage/storage.router";
import { StorageConfig } from "../../common/storage/storage.config";
import { StorageObject, providerFor } from "../../common/storage/storage.types";
import {
  sanitizeFilename,
  contentType,
  inspectUpload,
  objectKey,
} from "../../common/storage/upload-safety";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";

const include = {
  task: { select: { id: true, title: true, subsystemId: true } },
  uploadedBy: { select: safeUserSelect },
} satisfies Prisma.AttachmentInclude;
type IndexedFile = Prisma.AttachmentGetPayload<{ include: typeof include }>;
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageRouter,
    private readonly config: StorageConfig,
    private readonly core: CoreAuthorizationService,
  ) {}

  private transaction<T>(
    actorId: string,
    operation: (
      tx: Prisma.TransactionClient,
      actor: ActorContext,
    ) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccounts(tx, [actorId]);
        return operation(tx, await this.core.actor(actorId, tx));
      },
      { isolationLevel: "ReadCommitted", timeout: 180000 },
    );
  }
  private present(file: IndexedFile, actor: ActorContext) {
    const {
      storageUrl,
      driveFileId,
      objectKey: key,
      bucket,
      storageError,
      ...safe
    } = file;
    return {
      ...safe,
      permissions: { canManage: this.allowed(actor, file, "manage") },
      integrity:
        file.provenance === "LEGACY_UNVERIFIED"
          ? "REVIEW_REQUIRED"
          : (storageError ?? "INDEXED"),
    };
  }
  private allowed(
    actor: ActorContext,
    file: Pick<IndexedFile, "task" | "scopeSubsystemIds" | "category">,
    action: "read" | "manage",
  ) {
    if (actor.globalAuthority) return true;
    const policy =
      action === "manage" || file.category === "EXPORT"
        ? canManageSubsystem
        : canReadSubsystem;
    if (file.task) return policy(actor, file.task.subsystemId);
    return (
      file.scopeSubsystemIds.length > 0 &&
      file.scopeSubsystemIds.every((id) => policy(actor, id))
    );
  }
  async list(actorId: string, deleted = false) {
    const actor = await this.core.actor(actorId);
    const ids = [...actor.readableSubsystemIds];
    const rows = await this.prisma.attachment.findMany({
      where: {
        deletedAt: deleted ? { not: null } : null,
        purgedAt: null,
        ...(actor.globalAuthority
          ? {}
          : {
              OR: [
                {
                  task: {
                    ...this.core.taskWhere(actor),
                    deletedAt: null,
                    isArchived: false,
                  },
                },
                { taskId: null, scopeSubsystemIds: { hasSome: ids } },
              ],
            }),
      },
      include,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows
      .filter((file) => this.allowed(actor, file, deleted ? "manage" : "read"))
      .map((file) => this.present(file, actor));
  }
  private async target(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    taskId?: string | null,
    scopes: string[] = [],
    action: "read" | "manage" = "manage",
  ) {
    if (taskId) {
      await this.core.lockTasks(tx, [taskId]);
      if (actor.globalAuthority) {
        const task = await tx.task.findUnique({
          where: { id: taskId },
          select: { subsystemId: true },
        });
        if (!task) throw new NotFoundException("Task not found");
        return [task.subsystemId];
      }
      return [(await this.core.task(actor, taskId, action, tx)).subsystemId];
    }
    if (!scopes.length && !actor.globalAuthority)
      throw new ForbiddenException("Unlinked files require OWNER");
    for (const id of scopes) {
      if (
        !(action === "manage" ? canManageSubsystem : canReadSubsystem)(
          actor,
          id,
        )
      )
        throw new ForbiddenException("File scope denied");
      if (
        !(await tx.subsystem.findUnique({
          where: { id },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Subsystem not found");
    }
    return scopes;
  }
  private async locked(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    id: string,
    action: "read" | "manage",
  ) {
    await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${id} FOR UPDATE`;
    const file = await tx.attachment.findUnique({ where: { id }, include });
    if (!file) throw new NotFoundException("File not found");
    await this.target(
      tx,
      actor,
      file.taskId,
      file.scopeSubsystemIds,
      file.category === "EXPORT" ? "manage" : action,
    );
    return file;
  }
  private object(file: Attachment): StorageObject {
    if (
      file.provenance !== "VERIFIED" ||
      !file.provider ||
      !file.objectKey ||
      providerFor(file.category) !== file.provider ||
      (file.provider === "S3" && !file.bucket) ||
      (file.provider === "DRIVE" &&
        (file.bucket !== null || !/^[\w-]+$/.test(file.objectKey))) ||
      (file.provider === "S3" &&
        !/^antara-v1\/(cad|image|export|other)\/[a-f0-9-]{36}$/.test(
          file.objectKey,
        ))
    )
      throw new ConflictException({
        code: "FILE_PROVENANCE_REVIEW_REQUIRED",
        message: "File metadata requires reconciliation",
      });
    return {
      provider: file.provider,
      objectKey: file.objectKey,
      bucket: file.bucket,
    };
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    action: string,
  ) {
    return tx.auditLog.create({
      data: {
        actorId,
        entityType: "Attachment",
        entityId: id,
        action,
        payload: { storageLifecycle: true },
      },
    });
  }
  /** Bounded compatibility adapter. New clients use multipart; no caller identity/size is trusted. */
  async create(payload: CreateAttachmentDto, actorId: string) {
    if (!payload.contentBase64)
      throw new BadRequestException("File content is required");
    if (payload.contentBase64.length > 1400000)
      throw new BadRequestException(
        "Use multipart upload for files over 1 MiB",
      );
    const dir = await mkdtemp(join(tmpdir(), "antara-upload-"));
    try {
      const path = join(dir, "content");
      await writeFile(path, Buffer.from(payload.contentBase64, "base64"), {
        mode: 0o600,
      });
      return await this.upload(
        {
          path,
          name: payload.name,
          mimeType: payload.mimeType,
          category:
            payload.category ??
            (payload.mimeType === "application/pdf" ? "DOCUMENT" : "OTHER"),
          taskId: payload.taskId,
          tags: payload.tags,
        },
        actorId,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  async upload(
    input: {
      path: string;
      name: string;
      mimeType: string;
      category: FileCategory;
      taskId?: string;
      tags?: string[];
    },
    actorId: string,
    sourceScopes: string[] = [],
  ) {
    const sizeBytes = await inspectUpload(input.path, this.config.maxBytes);
    const name = sanitizeFilename(input.name),
      mimeType = contentType(input.mimeType);
    await this.core.withActor(actorId, (tx, actor) =>
      this.target(tx, actor, input.taskId, sourceScopes),
    );
    const provider = this.storage.forCategory(input.category);
    const uploaded = await this.storage.run(() =>
      provider.put({
        path: input.path,
        name,
        mimeType,
        sizeBytes,
        key: objectKey(input.category),
      }),
    );
    try {
      if (
        uploaded.provider !== providerFor(input.category) ||
        !uploaded.objectKey
      )
        throw new Error("Invalid provider response");
      return await this.core.withActor(actorId, async (tx, actor) => {
        await this.target(tx, actor, input.taskId, sourceScopes);
        const file = await tx.attachment.create({
          data: {
            name,
            mimeType,
            sizeBytes,
            category: input.category,
            ...uploaded,
            provenance: "VERIFIED",
            storageUrl: "",
            driveFileId:
              uploaded.provider === "DRIVE" ? uploaded.objectKey : null,
            taskId: input.taskId ?? null,
            scopeSubsystemIds: input.taskId
              ? []
              : [...new Set(sourceScopes)].sort(),
            tags: input.tags ?? [],
            uploadedById: actorId,
          },
          include,
        });
        await this.audit(tx, actorId, file.id, "FILE_UPLOAD");
        return this.present(file, actor);
      });
    } catch (error) {
      try {
        await provider.remove(uploaded);
      } catch {
        this.logger.error(
          "STORAGE_COMPENSATION_FAILED: provider inventory reconciliation required",
        );
      }
      throw error;
    }
  }
  async open(id: string, actorId: string) {
    return this.transaction(actorId, async (tx, actor) => {
      const file = await this.locked(tx, actor, id, "read");
      if (file.deletedAt || file.purgedAt)
        throw new NotFoundException("File not available");
      const object = this.object(file);
      const provider = this.storage.provider(object.provider);
      if (!(await this.storage.run(() => provider.exists(object))))
        throw new ConflictException(
          "Provider object is missing; reconciliation required",
        );
      const access = await this.storage.run(() =>
        provider.open(object, file.name),
      );
      return {
        access,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      };
    });
  }
  async delete(id: string, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      const file = await this.locked(tx, actor, id, "manage");
      if (!file.deletedAt) {
        const now = new Date();
        await tx.attachment.update({
          where: { id },
          data: {
            deletedAt: now,
            purgeAfter: new Date(
              now.getTime() + this.config.retentionDays * 86400000,
            ),
          },
        });
        await this.audit(tx, actorId, id, "FILE_SOFT_DELETE");
      }
      return { deleted: true };
    });
  }
  async restore(id: string, actorId: string) {
    return this.transaction(actorId, async (tx, actor) => {
      const file = await this.locked(tx, actor, id, "manage");
      if (
        !file.deletedAt ||
        file.purgedAt ||
        !file.purgeAfter ||
        file.purgeAfter <= new Date()
      )
        throw new ConflictException("File is outside the restore window");
      const object = this.object(file);
      if (
        !(await this.storage.run(() =>
          this.storage.provider(object.provider).exists(object),
        ))
      )
        throw new ConflictException("Provider object is missing");
      const restored = await tx.attachment.update({
        where: { id },
        data: { deletedAt: null, purgeAfter: null, storageError: null },
        include,
      });
      await this.audit(tx, actorId, id, "FILE_RESTORE");
      return this.present(restored, actor);
    });
  }
  async purge(id: string, actorId: string) {
    const result = await this.transaction(actorId, async (tx, actor) => {
      if (!actor.globalAuthority)
        throw new ForbiddenException("OWNER required");
      const file = await this.locked(tx, actor, id, "manage");
      if (file.purgedAt) return { purged: true };
      if (!file.deletedAt || !file.purgeAfter || file.purgeAfter > new Date())
        throw new ConflictException("Retention has not expired");
      const object = this.object(file);
      try {
        await this.storage.provider(object.provider).remove(object);
      } catch {
        await tx.attachment.update({
          where: { id },
          data: { storageError: "PURGE_FAILED" },
        });
        await this.audit(tx, actorId, id, "FILE_PURGE_FAILED");
        return { purged: false };
      }
      await tx.attachment.update({
        where: { id },
        data: { purgedAt: new Date(), storageError: null },
      });
      await this.audit(tx, actorId, id, "FILE_PURGE");
      return { purged: true };
    });
    if (!result.purged)
      throw new ConflictException({
        code: "PURGE_FAILED",
        message: "Provider purge failed; recorded for reconciliation",
      });
    return result;
  }
  async reconcile(actorId: string, cursor?: string) {
    const actor = await this.core.actor(actorId);
    if (!actor.globalAuthority) throw new ForbiddenException("OWNER required");
    const files = await this.prisma.attachment.findMany({
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const results = [];
    for (const file of files) {
      let status: string;
      try {
        const object = this.object(file);
        if (file.purgedAt) status = "PURGED";
        else if (!(await this.storage.provider(object.provider).exists(object)))
          status = "PROVIDER_MISSING";
        else if (file.storageError) status = file.storageError;
        else if (
          file.deletedAt &&
          file.purgeAfter &&
          file.purgeAfter <= new Date()
        )
          status = "RETENTION_EXPIRED";
        else status = "PRESENT";
      } catch (error) {
        status =
          error instanceof ConflictException
            ? "LEGACY_OR_MALFORMED"
            : "PROVIDER_UNAVAILABLE";
      }
      results.push({ id: file.id, status });
    }
    return {
      mode: "READ_ONLY",
      results,
      cursor: files.length === 100 ? files[99]!.id : null,
    };
  }
  async orphans(actorId: string, kind: "DRIVE" | "S3", cursor?: string) {
    if (!(await this.core.actor(actorId)).globalAuthority)
      throw new ForbiddenException("OWNER required");
    const inventory = await this.storage.run(() =>
      this.storage.provider(kind).inventory(cursor),
    );
    const results = [];
    for (const object of inventory.objects) {
      const existing = await this.prisma.attachment.findFirst({
        where: {
          OR: [
            {
              provider: kind,
              objectKey: object.objectKey,
              bucket: object.bucket,
            },
            ...(kind === "DRIVE" ? [{ driveFileId: object.objectKey }] : []),
          ],
        },
        select: { id: true },
      });
      if (!existing)
        results.push({
          objectKey: object.objectKey,
          status: "ORPHAN_CANDIDATE_REVIEW_ONLY",
        });
    }
    return { mode: "READ_ONLY", results, cursor: inventory.cursor };
  }
}
