import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient, FileCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import {
  SessionService,
  lockAccounts,
} from "../../common/sessions/session.service";
import { JwtStrategy } from "../auth/strategies/jwt.strategy";
import { requireLocalDatabaseUrl } from "../../scripts/local-database-url";
import { provisionCanonicalSubsystems } from "../../scripts/provision-canonical-subsystems";
import { FilesService } from "./files.service";
import { FilesController } from "./files.controller";
import { StorageRouter } from "../../common/storage/storage.router";
import { StorageConfig } from "../../common/storage/storage.config";
import { storageFixture } from "../../../test/storage.fixture";
const raw = process.env.STORAGE_TEST_DATABASE_URL;
if (process.env.STORAGE_REQUIRE_DB === "true" && !raw)
  throw new Error("STORAGE_TEST_DATABASE_URL required");
(raw ? describe : describe.skip)(
  "Phase 6 PostgreSQL migrations, storage authorization and lifecycle",
  () => {
    let root: PrismaClient,
      db: PrismaService,
      app: INestApplication,
      service: FilesService,
      dir: string,
      schema: string,
      clean: string,
      origin: string,
      adcs: string,
      payload: string,
      taskA: string,
      taskP: string;
    const storage = storageFixture();
    const tokens = new Map<string, string>();
    const apiRoot = path.resolve(__dirname, "../../..");
    const migration = "20261008000000_phase_6_storage";
    function deploy(url: string, folder: string) {
      execFileSync(
        process.execPath,
        [
          require.resolve("prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          path.join(folder, "schema.prisma"),
        ],
        {
          cwd: folder,
          env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
          stdio: "pipe",
        },
      );
    }
    async function req(
      actor: string,
      route: string,
      method = "GET",
      body?: object,
    ) {
      return fetch(origin + route, {
        method,
        headers: {
          Authorization: `Bearer ${tokens.get(actor)}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    }
    async function upload(
      actor = "owner",
      taskId: string | undefined = taskA,
      category: FileCategory = "DOCUMENT",
    ) {
      return service.create(
        {
          name: "../../review.pdf",
          mimeType: "application/pdf",
          sizeBytes: 999,
          contentBase64: Buffer.from("hello").toString("base64"),
          taskId,
          category,
        },
        actor,
      );
    }
    async function expired(id: string) {
      await db.attachment.update({
        where: { id },
        data: {
          deletedAt: new Date(Date.now() - 32 * 86400000),
          purgeAfter: new Date(Date.now() - 86400000),
        },
      });
    }
    beforeAll(async () => {
      const url = new URL(requireLocalDatabaseUrl(raw));
      if (url.pathname !== "/antara_phase6_test")
        throw new Error("Use dedicated antara_phase6_test");
      root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
      schema = `phase6_${process.pid}_${Date.now()}`;
      clean = `${schema}_clean`;
      await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await root.$executeRawUnsafe(`CREATE SCHEMA "${clean}"`);
      dir = mkdtempSync(path.join(tmpdir(), "antara-phase6-"));
      const old = path.join(dir, "old"),
        next = path.join(dir, "new");
      cpSync(path.join(apiRoot, "prisma"), old, { recursive: true });
      cpSync(path.join(apiRoot, "prisma"), next, { recursive: true });
      rmSync(path.join(old, "migrations", migration), { recursive: true });
      url.searchParams.set("schema", schema);
      deploy(url.toString(), old);
      db = new PrismaService({ datasources: { db: { url: url.toString() } } });
      await db.$executeRaw`INSERT INTO "Attachment"(id,name,"mimeType","sizeBytes","storageUrl",tags) VALUES ('legacy','historical.pdf','application/pdf',5,'local://unverified',ARRAY[]::TEXT[])`;
      deploy(url.toString(), next);
      url.searchParams.set("schema", clean);
      deploy(url.toString(), next);
      await provisionCanonicalSubsystems(db);
      adcs = (await db.subsystem.findUniqueOrThrow({ where: { key: "ADCS" } }))
        .id;
      payload = (
        await db.subsystem.findUniqueOrThrow({ where: { key: "PAYLOAD" } })
      ).id;
      const config = new ConfigService({
        auth: { accessSecret: "phase6-local-secret" },
      });
      const sessions = new SessionService(db, new JwtService(), config);
      for (const [id, role, subsystemId, accessLevel] of [
        ["owner", "OWNER", null, null],
        ["admin", "ADMIN", adcs, "ADMIN"],
        ["unrelated", "ADMIN", payload, "ADMIN"],
        ["member", "MEMBER", adcs, "MEMBER"],
        ["outsider", "MEMBER", payload, "MEMBER"],
      ] as const) {
        const user = await db.user.create({
          data: {
            id,
            name: id,
            email: `${id}@fixture.invalid`,
            role,
            passwordHash: "SECRET_SENTINEL",
          },
        });
        if (subsystemId && accessLevel)
          await db.subsystemMembership.create({
            data: { userId: id, subsystemId, accessLevel },
          });
        const credentials = await db.$transaction(async (tx) => {
          await lockAccounts(tx, [id]);
          return sessions.issue(tx, user);
        });
        tokens.set(id, credentials.accessToken);
      }
      taskA = (
        await db.task.create({
          data: {
            title: "ADCS task",
            description: "fixture",
            subsystemId: adcs,
            assignedById: "owner",
            priority: "HIGH",
            estimatedHours: 1,
            deadline: new Date(),
          },
        })
      ).id;
      taskP = (
        await db.task.create({
          data: {
            title: "Payload task",
            description: "fixture",
            subsystemId: payload,
            assignedById: "owner",
            priority: "HIGH",
            estimatedHours: 1,
            deadline: new Date(),
          },
        })
      ).id;
      const module = await Test.createTestingModule({
        imports: [PassportModule],
        controllers: [FilesController],
        providers: [
          FilesService,
          AuthorizationService,
          CoreAuthorizationService,
          SessionService,
          JwtStrategy,
          JwtService,
          { provide: PrismaService, useValue: db },
          { provide: ConfigService, useValue: config },
          { provide: StorageRouter, useValue: storage.router },
          { provide: StorageConfig, useValue: storage.config },
        ],
      }).compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.listen(0, "127.0.0.1");
      origin = await app.getUrl();
      service = module.get(FilesService);
    }, 60000);
    afterAll(async () => {
      await app?.close();
      await db?.$disconnect();
      if (root) {
        await root.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
        await root.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${clean}" CASCADE`,
        );
        await root.$disconnect();
      }
      if (dir) rmSync(dir, { recursive: true, force: true });
    });
    it("clean and upgrade chains match immutable repository checksums", async () => {
      const expected = readdirSync(
        path.join(apiRoot, "prisma/migrations"),
      ).filter((n) => /^\d/.test(n));
      for (const name of [schema, clean]) {
        const rows = await root.$queryRawUnsafe<
          { migration_name: string; checksum: string }[]
        >(
          `SELECT migration_name,checksum FROM "${name}"."_prisma_migrations" ORDER BY migration_name`,
        );
        expect(rows.map((r) => r.migration_name)).toEqual(expected);
        for (const row of rows)
          expect(row.checksum).toBe(
            createHash("sha256")
              .update(
                readFileSync(
                  path.join(
                    apiRoot,
                    "prisma/migrations",
                    row.migration_name,
                    "migration.sql",
                  ),
                ),
              )
              .digest("hex"),
          );
      }
    });
    it("upgrade preserves legacy evidence and refuses invented provenance", async () => {
      const row = await db.attachment.findUniqueOrThrow({
        where: { id: "legacy" },
      });
      expect(row.storageUrl).toBe("local://unverified");
      expect(row.provenance).toBe("LEGACY_UNVERIFIED");
      await expect(service.open("legacy", "owner")).rejects.toThrow(
        "reconciliation",
      );
    });
    it("database rejects incomplete verified metadata", async () => {
      await expect(
        db.attachment.update({
          where: { id: "legacy" },
          data: { provenance: "VERIFIED" },
        }),
      ).rejects.toThrow();
    });
    it.each([
      "DOCUMENT",
      "MEETING_REPORT",
      "CAD",
      "IMAGE",
      "EXPORT",
      "OTHER",
    ] as const)("%s persists routed provider metadata", async (category) => {
      const file = await upload("owner", taskA, category);
      const row = await db.attachment.findUniqueOrThrow({
        where: { id: file.id },
      });
      expect(row.provider).toBe(
        ["DOCUMENT", "MEETING_REPORT"].includes(category) ? "DRIVE" : "S3",
      );
      expect(row.uploadedById).toBe("owner");
      expect(row.sizeBytes).toBe(5);
      expect(row.objectKey).toBeTruthy();
      expect(file).not.toHaveProperty("objectKey");
      expect(file).not.toHaveProperty("storageUrl");
      expect(JSON.stringify(file)).not.toMatch(
        /SECRET_SENTINEL|passwordHash|refreshTokenHash/,
      );
    });
    it.each(["owner", "admin", "member"])(
      "%s can open readable linked file",
      async (actor) => {
        const file = await upload();
        const response = await req(actor, `/files/${file.id}/open`);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await response.text();
      },
    );
    it.each(["unrelated", "outsider"])(
      "%s denied before provider access",
      async (actor) => {
        const file = await upload();
        const before = jest.mocked(storage.drive.open).mock.calls.length;
        expect((await req(actor, `/files/${file.id}/open`)).status).toBe(403);
        expect(storage.drive.open).toHaveBeenCalledTimes(before);
      },
    );
    it("unlinked files are OWNER only", async () => {
      const file = await service.create(
        {
          name: "global.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1,
          contentBase64: "aGk=",
        },
        "owner",
      );
      expect((await req("member", `/files/${file.id}/open`)).status).toBe(403);
      expect((await req("owner", `/files/${file.id}/open`)).status).toBe(200);
    });
    it("multipart rejects spoofed scope and actor fields", async () => {
      const body = new FormData();
      body.append("file", new Blob(["test"]), "a.pdf");
      body.append("category", "DOCUMENT");
      body.append("subsystemId", payload);
      const res = await fetch(origin + "/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.get("owner")}` },
        body,
      });
      expect(res.status).toBe(400);
    });
    it("multipart streams bounded content and derives uploader", async () => {
      const body = new FormData();
      body.append("file", new Blob(["abc"]), "../../part.step");
      body.append("category", "CAD");
      body.append("taskId", taskA);
      const res = await fetch(origin + "/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.get("admin")}` },
        body,
      });
      expect(res.status).toBe(201);
      const file = (await res.json()) as {
        sizeBytes: number;
        uploadedById: string;
        provider: string;
      };
      expect(file.sizeBytes).toBe(3);
      expect(file.uploadedById).toBe("admin");
      expect(file.provider).toBe("S3");
    });
    it("oversized multipart fails before provider upload", async () => {
      const body = new FormData();
      body.append("file", new Blob([new Uint8Array(2048)]), "large.step");
      body.append("category", "CAD");
      body.append("taskId", taskA);
      const count = await db.attachment.count();
      const calls = jest.mocked(storage.s3.put).mock.calls.length;
      const response = await fetch(origin + "/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.get("owner")}` },
        body,
      });
      expect(response.status).toBe(413);
      expect(await db.attachment.count()).toBe(count);
      expect(storage.s3.put).toHaveBeenCalledTimes(calls);
    });
    it("MEMBER upload remains denied", async () => {
      expect(
        (await req("member", "/files/attachments", "POST", { name: "x" }))
          .status,
      ).toBe(403);
    });
    it("soft deletion preserves provider and hides list/open immediately", async () => {
      const file = await upload();
      const before = jest.mocked(storage.drive.remove).mock.calls.length;
      await service.delete(file.id, "admin");
      expect(storage.drive.remove).toHaveBeenCalledTimes(before);
      expect((await service.list("member")).map((v) => v.id)).not.toContain(
        file.id,
      );
      expect((await req("owner", `/files/${file.id}/open`)).status).toBe(404);
      expect((await service.list("admin", true)).map((v) => v.id)).toContain(
        file.id,
      );
    });
    it("authorized restore checks object existence", async () => {
      const file = await upload();
      await service.delete(file.id, "admin");
      await service.restore(file.id, "admin");
      expect(
        (await db.attachment.findUniqueOrThrow({ where: { id: file.id } }))
          .deletedAt,
      ).toBeNull();
    });
    it("restore refuses missing provider content", async () => {
      const file = await upload();
      await service.delete(file.id, "admin");
      jest.mocked(storage.drive.exists).mockResolvedValueOnce(false);
      await expect(service.restore(file.id, "admin")).rejects.toThrow(
        "missing",
      );
      expect(
        (await db.attachment.findUniqueOrThrow({ where: { id: file.id } }))
          .deletedAt,
      ).not.toBeNull();
    });
    it("purge before retention fails without provider deletion", async () => {
      const file = await upload();
      await service.delete(file.id, "owner");
      const n = jest.mocked(storage.drive.remove).mock.calls.length;
      await expect(service.purge(file.id, "owner")).rejects.toThrow(
        "Retention",
      );
      expect(storage.drive.remove).toHaveBeenCalledTimes(n);
    });
    it("purge after retention tombstones and audits", async () => {
      const file = await upload();
      await expired(file.id);
      await service.purge(file.id, "owner");
      const row = await db.attachment.findUniqueOrThrow({
        where: { id: file.id },
      });
      expect(row.purgedAt).not.toBeNull();
      expect(
        await db.auditLog.count({
          where: { entityId: file.id, action: "FILE_PURGE" },
        }),
      ).toBe(1);
      await expect(service.restore(file.id, "owner")).rejects.toThrow(
        "restore window",
      );
    });
    it("purge failure is persisted and never reported as success", async () => {
      const file = await upload();
      await expired(file.id);
      jest
        .mocked(storage.drive.remove)
        .mockRejectedValueOnce(new Error("secret"));
      await expect(service.purge(file.id, "owner")).rejects.toThrow("recorded");
      expect(
        (await db.attachment.findUniqueOrThrow({ where: { id: file.id } }))
          .storageError,
      ).toBe("PURGE_FAILED");
    });
    it.each(["member", "unrelated"])(
      "%s cannot delete/restore other scope",
      async (actor) => {
        const file = await upload();
        await expect(service.delete(file.id, actor)).rejects.toThrow();
        await service.delete(file.id, "owner");
        await expect(service.restore(file.id, actor)).rejects.toThrow();
      },
    );
    it("ADMIN cannot purge", async () => {
      const file = await upload();
      await expired(file.id);
      await expect(service.purge(file.id, "admin")).rejects.toThrow("OWNER");
    });
    it("reconciliation detects missing, expired, legacy and failed rows", async () => {
      const file = await upload();
      const row = await db.attachment.findUniqueOrThrow({
        where: { id: file.id },
      });
      storage.objects.delete(row.objectKey!);
      const report = await service.reconcile("owner");
      expect(report.results).toContainEqual({
        id: file.id,
        status: "PROVIDER_MISSING",
      });
      expect(report.results).toContainEqual({
        id: "legacy",
        status: "LEGACY_OR_MALFORMED",
      });
      expect(report.results.some((v) => v.status === "PURGE_FAILED")).toBe(
        true,
      );
    });
    it("provider orphan candidates are never auto-deleted", async () => {
      storage.objects.add("orphan");
      const n = jest.mocked(storage.drive.remove).mock.calls.length;
      const report = await service.orphans("owner", "DRIVE");
      expect(report.results).toContainEqual({
        objectKey: "orphan",
        status: "ORPHAN_CANDIDATE_REVIEW_ONLY",
      });
      expect(storage.drive.remove).toHaveBeenCalledTimes(n);
    });
    it("one bucket contains files from multiple subsystems", async () => {
      const a = await upload("owner", taskA, "CAD"),
        p = await upload("owner", taskP, "IMAGE");
      const rows = await db.attachment.findMany({
        where: { id: { in: [a.id, p.id] } },
      });
      expect(new Set(rows.map((v) => v.bucket)).size).toBe(1);
      expect(rows[0]!.objectKey).not.toBe(rows[1]!.objectKey);
    });
    it("membership revocation during provider upload compensates instead of persisting", async () => {
      const original = storage.drive.put.bind(storage.drive);
      jest.mocked(storage.drive.put).mockImplementationOnce(async (input) => {
        const result = await original(input);
        await db.$transaction(async (tx) => {
          await lockAccounts(tx, ["admin"]);
          await tx.subsystemMembership.delete({
            where: {
              userId_subsystemId: { userId: "admin", subsystemId: adcs },
            },
          });
        });
        return result;
      });
      const count = await db.attachment.count();
      await expect(upload("admin")).rejects.toThrow();
      expect(await db.attachment.count()).toBe(count);
      expect(storage.drive.remove).toHaveBeenCalled();
      await db.subsystemMembership.create({
        data: { userId: "admin", subsystemId: adcs, accessLevel: "ADMIN" },
      });
    });
    it("persisted task scope overrides caller open query", async () => {
      const file = await upload("owner", taskP);
      expect(
        (await req("admin", `/files/${file.id}/open?subsystemId=${adcs}`))
          .status,
      ).toBe(403);
    });
    it("scope race waits for persisted task move and denies stale management", async () => {
      const file = await upload();
      let release!: () => void, locked!: () => void;
      const held = new Promise<void>((r) => (locked = r)),
        done = new Promise<void>((r) => (release = r));
      const mover = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Task" WHERE id=${taskA} FOR UPDATE`;
          locked();
          await done;
          await tx.task.update({
            where: { id: taskA },
            data: { subsystemId: payload },
          });
        },
        { timeout: 10000 },
      );
      await held;
      const removal = service.delete(file.id, "admin").then(
        () => false,
        () => true,
      );
      try {
        let waiting = false;
        for (let i = 0; i < 100; i++) {
          const rows = await root.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Task%' AND pid<>pg_backend_pid()) AS waiting`;
          if (rows[0]?.waiting) {
            waiting = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(waiting).toBe(true);
      } finally {
        release();
        await mover;
      }
      expect(await removal).toBe(true);
      expect(
        (await db.attachment.findUniqueOrThrow({ where: { id: file.id } }))
          .deletedAt,
      ).toBeNull();
      await db.task.update({
        where: { id: taskA },
        data: { subsystemId: adcs },
      });
    });
    it("failed upload audit rolls back metadata and compensates provider", async () => {
      const count = await db.attachment.count();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION fail_storage_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='FILE_UPLOAD' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER fail_storage_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_storage_audit()`,
      );
      try {
        await expect(upload()).rejects.toThrow();
        expect(await db.attachment.count()).toBe(count);
        expect(storage.drive.remove).toHaveBeenCalled();
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER fail_storage_audit ON "AuditLog"`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION fail_storage_audit()`);
      }
    });
    it("export scope is persisted and excludes MEMBER administrative data access", async () => {
      const source = path.join(dir, "export.md");
      writeFileSync(source, "scoped export");
      const file = await service.upload(
        {
          path: source,
          name: "export.md",
          mimeType: "text/markdown",
          category: "EXPORT",
        },
        "admin",
        [adcs],
      );
      expect(file.scopeSubsystemIds).toEqual([adcs]);
      expect((await req("member", `/files/${file.id}/open`)).status).toBe(403);
      expect((await req("unrelated", `/files/${file.id}/open`)).status).toBe(
        403,
      );
      expect((await req("admin", `/files/${file.id}/open`)).status).toBe(200);
    });
    it("revoked session cannot open file", async () => {
      const file = await upload();
      await db.session.updateMany({
        where: { userId: "outsider" },
        data: { revokedAt: new Date() },
      });
      expect((await req("outsider", `/files/${file.id}/open`)).status).toBe(
        401,
      );
    });
  },
);
