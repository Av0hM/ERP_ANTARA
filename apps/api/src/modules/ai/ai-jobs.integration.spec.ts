import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient, Prisma } from "@prisma/client";
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
import { AiConfig } from "../../common/ai/ai.config";
import { AiFailure, AiProvider } from "../../common/ai/ai.provider";
import { AiJobsService } from "./ai-jobs.service";
import { AiJobsController } from "./ai-jobs.controller";
import { AiQueueService } from "./ai-queue.service";
const raw = process.env.AI_TEST_DATABASE_URL;
if (process.env.AI_REQUIRE_DB === "true" && !raw)
  throw new Error("AI_TEST_DATABASE_URL required");
(raw ? describe : describe.skip)(
  "Phase 7 isolated PostgreSQL jobs and HTTP",
  () => {
    let root: PrismaClient,
      db: PrismaService,
      app: INestApplication,
      service: AiJobsService;
    let folder: string,
      schema: string,
      origin: string,
      adcs: string,
      payload: string,
      task: string;
    const tokens = new Map<string, string>();
    const provider = { generate: jest.fn(), readiness: jest.fn() };
    const queue = { enqueue: jest.fn(), state: jest.fn() };
    const apiRoot = path.resolve(__dirname, "../../..");
    const config = new ConfigService({
      AI_ENABLED: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:1",
      OLLAMA_MODEL: "offline-fixture",
      AI_MAX_RETRIES: "1",
      auth: { accessSecret: "phase7-fixture-only" },
    });
    const aiConfig = new AiConfig(config);
    async function req(actor: string, route: string, body?: object) {
      return fetch(origin + route, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${tokens.get(actor)}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    }
    function submit(actor = "admin", subsystemId: string | undefined = adcs) {
      return service.submit(actor, { operation: "INSIGHTS", subsystemId });
    }
    function deploy(url: string, location: string) {
      execFileSync(
        process.execPath,
        [
          require.resolve("prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          path.join(location, "schema.prisma"),
        ],
        {
          cwd: location,
          env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
          stdio: "pipe",
        },
      );
    }
    beforeAll(async () => {
      const url = new URL(requireLocalDatabaseUrl(raw));
      if (url.pathname !== "/antara_phase7_test")
        throw new Error("Dedicated Phase 7 database required");
      root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
      schema = `phase7_${process.pid}_${Date.now()}`;
      await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}_clean"`);
      folder = mkdtempSync(path.join(tmpdir(), "antara-phase7-"));
      const old = path.join(folder, "old"),
        next = path.join(folder, "next");
      cpSync(path.join(apiRoot, "prisma"), old, { recursive: true });
      cpSync(path.join(apiRoot, "prisma"), next, { recursive: true });
      rmSync(path.join(old, "migrations/20261009000000_phase_7_ai_jobs"), {
        recursive: true,
      });
      url.searchParams.set("schema", schema);
      deploy(url.toString(), old);
      db = new PrismaService({ datasources: { db: { url: url.toString() } } });
      await db.aIInsight.create({
        data: {
          id: "legacy",
          title: "historical",
          summary: "preserve",
          severity: "INFO",
          recommendation: "legacy",
          riskScore: 1,
        },
      });
      deploy(url.toString(), next);
      url.searchParams.set("schema", `${schema}_clean`);
      deploy(url.toString(), next);
      await provisionCanonicalSubsystems(db);
      adcs = (await db.subsystem.findUniqueOrThrow({ where: { key: "ADCS" } }))
        .id;
      payload = (
        await db.subsystem.findUniqueOrThrow({ where: { key: "PAYLOAD" } })
      ).id;
      const sessions = new SessionService(db, new JwtService(), config);
      for (const [id, role, scope, level] of [
        ["owner", "OWNER", null, null],
        ["admin", "ADMIN", adcs, "ADMIN"],
        ["member", "MEMBER", adcs, "MEMBER"],
        ["other", "ADMIN", payload, "ADMIN"],
      ] as const) {
        const user = await db.user.create({
          data: {
            id,
            name: id,
            email: `${id}@fixture.invalid`,
            role,
            passwordHash: "PRIVATE_HASH",
          },
        });
        if (scope && level)
          await db.subsystemMembership.create({
            data: { userId: id, subsystemId: scope, accessLevel: level },
          });
        const session = await db.$transaction(async (tx) => {
          await lockAccounts(tx, [id]);
          return sessions.issue(tx, user);
        });
        tokens.set(id, session.accessToken);
      }
      await db.subsystemMembership.create({
        data: { userId: "admin", subsystemId: payload, accessLevel: "MEMBER" },
      });
      for (const [id, scope, title] of [
        ["task-a", adcs, "ADCS authorized"],
        ["task-p", payload, "PRIVATE_PAYLOAD_TITLE"],
      ]) {
        await db.task.create({
          data: {
            id: id!,
            title: title!,
            subsystemId: scope!,
            assignedById: "owner",
            description: "fixture",
            priority: "HIGH",
            estimatedHours: 1,
            deadline: new Date(),
          },
        });
      }
      task = "task-a";
      const module = await Test.createTestingModule({
        imports: [PassportModule],
        controllers: [AiJobsController],
        providers: [
          AiJobsService,
          AuthorizationService,
          CoreAuthorizationService,
          SessionService,
          JwtService,
          JwtStrategy,
          { provide: PrismaService, useValue: db },
          { provide: ConfigService, useValue: config },
          { provide: AiConfig, useValue: aiConfig },
          { provide: AiProvider, useValue: provider },
          { provide: AiQueueService, useValue: queue },
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
      service = app.get(AiJobsService);
    }, 60000);
    beforeEach(async () => {
      jest.clearAllMocks();
      provider.generate.mockResolvedValue({ summary: "Bounded advice" });
      provider.readiness.mockResolvedValue("available");
      queue.enqueue.mockResolvedValue(undefined);
      queue.state.mockResolvedValue("waiting");
      await db.aIJob.deleteMany();
      await db.notification.deleteMany();
      await db.subsystemMembership.upsert({
        where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
        create: { userId: "admin", subsystemId: adcs, accessLevel: "ADMIN" },
        update: { accessLevel: "ADMIN" },
      });
      await db.task.update({
        where: { id: task },
        data: { deletedAt: null, subsystemId: adcs, title: "ADCS authorized" },
      });
    });
    afterAll(async () => {
      await app?.close();
      await db?.$disconnect();
      if (root && schema) {
        await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await root.$executeRawUnsafe(`DROP SCHEMA "${schema}_clean" CASCADE`);
      }
      await root?.$disconnect();
      if (folder) rmSync(folder, { recursive: true, force: true });
    });
    it("preserves legacy insights and applies clean/upgrade migration checksums", async () => {
      expect(
        (await db.aIInsight.findUniqueOrThrow({ where: { id: "legacy" } }))
          .summary,
      ).toBe("preserve");
      for (const scope of [schema, `${schema}_clean`]) {
        const history = await root.$queryRawUnsafe<
          Array<{ migration_name: string; checksum: string }>
        >(
          `SELECT migration_name, checksum FROM "${scope}"."_prisma_migrations" WHERE finished_at IS NOT NULL`,
        );
        const names = readdirSync(
          path.join(apiRoot, "prisma/migrations"),
        ).filter((name) => /^\d/.test(name));
        expect(history).toHaveLength(names.length);
        for (const row of history)
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
    it("returns 202 queued with safe identity and no completion claim", async () => {
      const response = await req("member", "/ai/summarize", { text: "Notes" });
      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body.status).toBe("QUEUED");
      expect(body.result).toBeNull();
      expect(body.success).toBeUndefined();
      expect(
        (await db.aIJob.findUniqueOrThrow({ where: { id: body.id } })).actorId,
      ).toBe("member");
      expect(JSON.stringify(body)).not.toMatch(
        /PRIVATE_HASH|passwordHash|refreshTokenHash|sourceRefs|offline-fixture/,
      );
    });
    it.each([
      { actorId: "owner" },
      { providerUrl: "http://evil" },
      { subsystemId: "other" },
    ])("summary rejects crafted input %#", async (fields) =>
      expect(
        (await req("member", "/ai/summarize", { text: "Notes", ...fields }))
          .status,
      ).toBe(400),
    );
    it("MEMBER administrative request denied before source query", async () => {
      const spy = jest.spyOn(db.task, "findMany");
      await expect(submit("member")).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
    it("mixed ADMIN cannot analyze MEMBER-only scope", async () => {
      await expect(submit("admin", payload)).rejects.toThrow();
      expect(await db.aIJob.count()).toBe(0);
    });
    it("OWNER global analysis allowed without memberships", async () => {
      const job = await service.submit("owner", { operation: "INSIGHTS" });
      await service.execute(job.id);
      expect(JSON.stringify(provider.generate.mock.calls)).toContain(
        "PRIVATE_PAYLOAD_TITLE",
      );
    });
    it("only exact authorized sources enter model context", async () => {
      const job = await submit();
      await service.execute(job.id);
      expect(JSON.stringify(provider.generate.mock.calls)).toContain(
        "ADCS authorized",
      );
      expect(JSON.stringify(provider.generate.mock.calls)).not.toContain(
        "PRIVATE_PAYLOAD_TITLE",
      );
    });
    it("persisted input excludes copied task bodies and secrets", async () => {
      const job = await submit();
      const stored = await db.aIJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(JSON.stringify(stored)).not.toMatch(
        /ADCS authorized|PRIVATE_HASH|refreshTokenHash/,
      );
    });
    it("success result and exactly one notification survive duplicate execution", async () => {
      const job = await submit();
      await Promise.all([service.execute(job.id), service.execute(job.id)]);
      await service.execute(job.id);
      expect(provider.generate).toHaveBeenCalledTimes(1);
      expect((await service.read("admin", job.id)).status).toBe("SUCCEEDED");
      expect(await db.notification.count()).toBe(1);
      expect((await db.notification.findFirstOrThrow()).body).not.toContain(
        "ADCS",
      );
    });
    it("running is persisted before provider invocation", async () => {
      const job = await submit();
      provider.generate.mockImplementationOnce(async () => {
        expect(
          (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } })).status,
        ).toBe("RUNNING");
        return { summary: "Valid" };
      });
      await service.execute(job.id);
    });
    it("transient retry records delay, no intermediate notification, then succeeds", async () => {
      const job = await submit();
      provider.generate.mockRejectedValueOnce(
        new AiFailure("PROVIDER_UNAVAILABLE", true),
      );
      await expect(service.execute(job.id)).rejects.toThrow();
      const retry = await service.read("admin", job.id);
      expect(retry).toMatchObject({ status: "QUEUED", attempts: 1 });
      expect(retry.nextAttemptAt).not.toBeNull();
      expect(await db.notification.count()).toBe(0);
      await service.execute(job.id);
      expect((await service.read("admin", job.id)).status).toBe("SUCCEEDED");
    });
    it("max attempts bounds retries with one generic failure notification", async () => {
      const job = await submit();
      provider.generate.mockRejectedValue(
        new AiFailure("PROVIDER_UNAVAILABLE", true),
      );
      await expect(service.execute(job.id)).rejects.toThrow();
      await service.execute(job.id);
      await service.execute(job.id);
      expect(await service.read("admin", job.id)).toMatchObject({
        status: "FAILED",
        attempts: 2,
        result: null,
      });
      expect(await db.notification.count()).toBe(1);
    });
    it("malformed output fails without fabricated result", async () => {
      const job = await submit();
      provider.generate.mockResolvedValue({ summary: 123 });
      await service.execute(job.id);
      expect(await service.read("admin", job.id)).toMatchObject({
        status: "FAILED",
        errorCode: "INVALID_MODEL_OUTPUT",
        result: null,
      });
    });
    it("queue outage is persisted, not success", async () => {
      queue.enqueue.mockRejectedValue(new Error("private redis host"));
      const job = await submit();
      expect(job).toMatchObject({
        status: "FAILED",
        errorCode: "QUEUE_UNAVAILABLE",
      });
      await service.execute(job.id);
      expect(provider.generate).not.toHaveBeenCalled();
    });
    it("pending bound limits repeated submissions", async () => {
      await submit();
      await submit();
      await submit();
      await expect(submit()).rejects.toThrow("Three AI jobs");
    });
    it("membership revoked before execution prevents prompt and notification", async () => {
      const job = await submit();
      await db.subsystemMembership.delete({
        where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
      });
      await service.execute(job.id);
      expect(provider.generate).not.toHaveBeenCalled();
      expect(await db.notification.count()).toBe(0);
      expect((await req("admin", `/ai/jobs/${job.id}`)).status).toBe(403);
    });
    it("revocation during inference prevents publication", async () => {
      const job = await submit();
      provider.generate.mockImplementationOnce(async () => {
        await db.subsystemMembership.delete({
          where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
        });
        return { summary: "Secret" };
      });
      await service.execute(job.id);
      expect(
        (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } })).result,
      ).toBeNull();
      expect(await db.notification.count()).toBe(0);
    });
    it("revocation after success denies next read", async () => {
      const job = await submit();
      await service.execute(job.id);
      await db.subsystemMembership.delete({
        where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
      });
      expect((await req("admin", `/ai/jobs/${job.id}`)).status).toBe(403);
    });
    it.each(["delete", "move"])(
      "source %s prevents generation",
      async (change) => {
        const job = await submit();
        await db.task.update({
          where: { id: task },
          data:
            change === "delete"
              ? { deletedAt: new Date() }
              : { subsystemId: payload },
        });
        await service.execute(job.id);
        expect(provider.generate).not.toHaveBeenCalled();
        expect(
          (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } }))
            .errorCode,
        ).toBe("SOURCE_CHANGED");
      },
    );
    it("other users cannot read or cancel personal jobs", async () => {
      const job = await service.submit("member", {
        operation: "SUMMARY",
        text: "private",
      });
      expect((await req("other", `/ai/jobs/${job.id}`)).status).toBe(403);
      await expect(service.cancel("other", job.id)).rejects.toThrow();
    });
    it("queued cancellation is durable and prevents inference", async () => {
      const job = await submit();
      expect((await service.cancel("admin", job.id)).status).toBe("CANCELLED");
      await service.execute(job.id);
      expect(provider.generate).not.toHaveBeenCalled();
    });
    it("cannot claim cancellation of completed inference", async () => {
      const job = await submit();
      await service.execute(job.id);
      await expect(service.cancel("admin", job.id)).rejects.toThrow(
        "Only queued",
      );
    });
    it("read-only reconciliation identifies missing queue and stale execution", async () => {
      const job = await submit();
      queue.state.mockResolvedValue("missing");
      expect((await service.reconcile("owner")).items[0]?.issues).toContain(
        "QUEUE_ENTRY_MISSING",
      );
      await db.aIJob.update({
        where: { id: job.id },
        data: { status: "RUNNING", startedAt: new Date(0) },
      });
      const before = await db.aIJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect((await service.reconcile("owner")).items[0]?.issues).toContain(
        "STALE_RUNNING",
      );
      expect(
        await db.aIJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toEqual(before);
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });
    it("reconciliation is OWNER-only", async () => {
      await expect(service.reconcile("admin")).rejects.toThrow();
    });
    it("notification DB failure rolls back result and success", async () => {
      const job = await submit();
      await db.$executeRawUnsafe(
        `CREATE FUNCTION fail_ai_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER fail_ai_notification BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION fail_ai_notification()`,
      );
      try {
        await expect(service.execute(job.id)).rejects.toThrow();
        expect(
          (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } })).status,
        ).not.toBe("SUCCEEDED");
        expect(
          (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } })).result,
        ).toBeNull();
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER fail_ai_notification ON "Notification"',
        );
        await db.$executeRawUnsafe("DROP FUNCTION fail_ai_notification()");
      }
    });

    it("scope revocation before a retry fails closed instead of stranding the job", async () => {
      const job = await submit();
      provider.generate.mockRejectedValueOnce(
        new AiFailure("PROVIDER_UNAVAILABLE", true),
      );
      await expect(service.execute(job.id)).rejects.toThrow();
      await db.subsystemMembership.delete({
        where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
      });
      await service.execute(job.id);
      expect(
        (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } })).status,
      ).toBe("FAILED");
      expect(provider.generate).toHaveBeenCalledTimes(1);
      expect(await db.notification.count()).toBe(0);
    });
    it("changed sources during inference cannot publish stale content", async () => {
      const job = await submit();
      provider.generate.mockImplementationOnce(async () => {
        await db.task.update({
          where: { id: task },
          data: { subsystemId: payload },
        });
        return { summary: "stale" };
      });
      await service.execute(job.id);
      expect(
        (await db.aIJob.findUniqueOrThrow({ where: { id: job.id } })).result,
      ).toBeNull();
    });
    it("completed results are unavailable after source revision", async () => {
      const job = await submit();
      await service.execute(job.id);
      await db.task.update({ where: { id: task }, data: { title: "Revised" } });
      expect((await req("admin", `/ai/jobs/${job.id}`)).status).toBe(409);
    });
    it("running cancellation refuses to claim inference stopped", async () => {
      const job = await submit();
      provider.generate.mockImplementationOnce(async () => {
        await expect(service.cancel("admin", job.id)).rejects.toThrow(
          "Only queued",
        );
        return { summary: "advisory" };
      });
      await service.execute(job.id);
    });
    it("terminal queue mismatch and exhausted attempts are review-only", async () => {
      const job = await submit();
      await db.aIJob.update({ where: { id: job.id }, data: { attempts: 2 } });
      queue.state.mockResolvedValue("failed");
      expect((await service.reconcile("owner")).items[0]?.issues).toEqual(
        expect.arrayContaining([
          "EXECUTION_STATE_MISMATCH",
          "ATTEMPTS_EXHAUSTED",
        ]),
      );
      expect(provider.generate).not.toHaveBeenCalled();
    });
    it("reconciliation detects corrupted success without a result and does not regenerate", async () => {
      const job = await submit();
      await db.aIJob.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", result: Prisma.JsonNull },
      });
      expect((await service.reconcile("owner")).items[0]?.issues).toContain(
        "RESULT_MISSING",
      );
      expect(provider.generate).not.toHaveBeenCalled();
    });
    it("inactive requester prevents inference and delivery", async () => {
      const job = await submit();
      await db.user.update({
        where: { id: "admin" },
        data: { isActive: false },
      });
      try {
        await service.execute(job.id);
        expect(provider.generate).not.toHaveBeenCalled();
        expect(await db.notification.count()).toBe(0);
        expect((await req("admin", `/ai/jobs/${job.id}`)).status).toBe(401);
      } finally {
        await db.user.update({
          where: { id: "admin" },
          data: { isActive: true },
        });
      }
    });
    it("OWNER session revocation cancels queued work and HTTP access", async () => {
      const job = await submit("owner");
      await db.session.updateMany({
        where: { userId: "owner" },
        data: { revokedAt: new Date(Date.now() + 1000) },
      });
      await service.execute(job.id);
      expect(provider.generate).not.toHaveBeenCalled();
      expect((await req("owner", `/ai/jobs/${job.id}`)).status).toBe(401);
    });
  },
);
