import { DecisionsController } from "../src/modules/decisions/decisions.controller";
import { DecisionsService } from "../src/modules/decisions/decisions.service";
import { AiJobsController } from "../src/modules/ai/ai-jobs.controller";
import { AiJobsService } from "../src/modules/ai/ai-jobs.service";
import { AiQueueService } from "../src/modules/ai/ai-queue.service";
import { AiConfig } from "../src/common/ai/ai.config";
import { AiProvider, AiFailure } from "../src/common/ai/ai.provider";
import { FilesController } from "../src/modules/files/files.controller";
import { FilesService } from "../src/modules/files/files.service";
import { StorageRouter } from "../src/common/storage/storage.router";
import { StorageConfig } from "../src/common/storage/storage.config";
import {
  providerFor,
  StorageProvider,
  StorageObject,
} from "../src/common/storage/storage.types";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
/** Isolated browser fixture server. Never imported by the application. */
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerModule } from "@nestjs/throttler";
import { getQueueToken } from "@nestjs/bullmq";
import { PrismaClient } from "@prisma/client";
import { cpSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { hash } from "bcryptjs";
import { requireLocalDatabaseUrl } from "../src/scripts/local-database-url";
import { provisionCanonicalSubsystems } from "../src/scripts/provision-canonical-subsystems";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AuthorizationService } from "../src/common/authorization/authorization.service";
import { CoreAuthorizationService } from "../src/common/authorization/core-authorization.service";
import { SessionService } from "../src/common/sessions/session.service";
import { RedisCacheService } from "../src/common/cache/redis-cache.service";
import { JwtStrategy } from "../src/modules/auth/strategies/jwt.strategy";
import { AuthController } from "../src/modules/auth/auth.controller";
import { AuthService } from "../src/modules/auth/auth.service";
import { GoogleIdentityService } from "../src/modules/auth/google-identity.service";
import { RefreshThrottleGuard } from "../src/modules/auth/refresh-throttle.guard";
import { UiContextController } from "../src/modules/ui-context/ui-context.controller";
import { UiContextService } from "../src/modules/ui-context/ui-context.service";
import { NotificationsController } from "../src/modules/notifications/notifications.controller";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { SubsystemsController } from "../src/modules/subsystems/subsystems.controller";
import { SubsystemsService } from "../src/modules/subsystems/subsystems.service";
import { AnalyticsController } from "../src/modules/analytics/analytics.controller";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";
import { TasksController } from "../src/modules/tasks/tasks.controller";
import { TasksService } from "../src/modules/tasks/tasks.service";
import { TaskEventsService } from "../src/modules/tasks/events/task-events.service";
import { AuditService } from "../src/modules/audit/audit.service";

// Explicit in-memory provider boundary for browser tests only; never production wiring.
const fileBytes = new Map<string, Buffer>();
function provider(kind: "DRIVE" | "S3"): StorageProvider {
  return {
    async put(input) {
      const key = kind === "DRIVE" ? input.key.replaceAll("/", "-") : input.key;
      fileBytes.set(key, await readFile(input.path));
      return {
        provider: kind,
        objectKey: key,
        bucket: kind === "S3" ? "browser-fixture" : null,
      };
    },
    async open(object) {
      const bytes = fileBytes.get(object.objectKey);
      if (!bytes) throw new Error("Missing fixture object");
      return { kind: "stream", stream: Readable.from([bytes]) };
    },
    async exists(object) {
      return fileBytes.has(object.objectKey);
    },
    async remove(object) {
      fileBytes.delete(object.objectKey);
    },
    async inventory() {
      return { objects: [] };
    },
  };
}
const storageBoundary = {
  provider,
  forCategory: (category: Parameters<typeof providerFor>[0]) =>
    provider(providerFor(category)),
  run: <T>(operation: () => Promise<T>) => operation(),
};

async function main() {
  const url = new URL(
    requireLocalDatabaseUrl(process.env.PHASE5_TEST_DATABASE_URL),
  );
  if (
    url.pathname !== "/antara_phase5_test" ||
    process.env.NODE_ENV === "production"
  )
    throw new Error("Dedicated local test database required");
  const root = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
  const schema = `phase5_browser_${process.pid}`;
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set("schema", schema);
  const temp = mkdtempSync(path.join(tmpdir(), "antara-phase5-"));
  cpSync(path.resolve(__dirname, "../prisma"), path.join(temp, "prisma"), {
    recursive: true,
  });
  execFileSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(temp, "prisma/schema.prisma"),
    ],
    {
      cwd: temp,
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        DIRECT_URL: url.toString(),
      },
      stdio: "pipe",
    },
  );
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await provisionCanonicalSubsystems(db);
  const catalog = await db.subsystem.findMany();
  const scope = (key: string) => {
    const row = catalog.find((s) => s.key === key);
    if (!row) throw new Error("Missing fixture subsystem");
    return row.id;
  };
  const passwordHash = await hash("Shell#Fixture123", 4);
  for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
    const id = role.toLowerCase();
    await db.user.create({
      data: {
        id,
        email: `${id}@shell.invalid`,
        name: `Shell ${role}`,
        role,
        passwordHash,
      },
    });
  }
  await db.subsystemMembership.createMany({
    data: [
      { userId: "admin", subsystemId: scope("ADCS"), accessLevel: "ADMIN" },
      { userId: "admin", subsystemId: scope("PAYLOAD"), accessLevel: "MEMBER" },
      { userId: "member", subsystemId: scope("ADCS"), accessLevel: "MEMBER" },
    ],
  });
  for (const [key, assignee] of [
    ["ADCS", "member"],
    ["PAYLOAD", "admin"],
  ]) {
    await db.task.create({
      data: {
        title: `${key} fixture task`,
        description: "Fixture",
        priority: "LOW",
        estimatedHours: 1,
        deadline: new Date("2027-01-01"),
        tags: [],
        dependencyIds: [],
        subsystemId: scope(key!),
        assignedById: "owner",
        assignedToId: assignee,
      },
    });
  }
  for (const userId of ["owner", "admin", "member"]) {
    await db.notification.create({
      data: {
        id: `notice-${userId}`,
        userId,
        title: `SECRET ${userId} protected title`,
        body: "Protected historical body",
        type: "SYSTEM",
      },
    });
  }
  const cache = new Map<string, unknown>();
  const module = await Test.createTestingModule({
    imports: [
      PassportModule,
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    ],
    controllers: [
      DecisionsController,
      AiJobsController,
      FilesController,
      AuthController,
      UiContextController,
      NotificationsController,
      SubsystemsController,
      AnalyticsController,
      TasksController,
    ],
    providers: [
      DecisionsService,
      AiJobsService,
      {
        provide: AiConfig,
        useValue: new AiConfig(
          new ConfigService({
            AI_ENABLED: "true",
            OLLAMA_BASE_URL: "http://127.0.0.1:1",
            OLLAMA_MODEL: "offline-browser",
          }),
        ),
      },
      {
        provide: AiProvider,
        useValue: {
          readiness: async () => "available",
          generate: async (input: unknown) => {
            await new Promise((resolve) => setTimeout(resolve, 6500));
            if (JSON.stringify(input).includes("fixture-fail"))
              throw new AiFailure("INVALID_MODEL_OUTPUT");
            return { summary: "Offline fixture summary" };
          },
        },
      },
      {
        provide: AiQueueService,
        useValue: {
          enqueue: async (id: string) => {
            setTimeout(() => {
              void app
                .get(AiJobsService)
                .execute(id)
                .catch(() => undefined);
            }, 1500);
          },
          state: async () => "waiting",
        },
      },
      FilesService,
      { provide: StorageRouter, useValue: storageBoundary },
      {
        provide: StorageConfig,
        useValue: new StorageConfig(
          new ConfigService({
            STORAGE_DRIVE_ENABLED: "false",
            STORAGE_S3_ENABLED: "false",
          }),
        ),
      },
      AuthService,
      JwtStrategy,
      SessionService,
      RefreshThrottleGuard,
      AuthorizationService,
      CoreAuthorizationService,
      UiContextService,
      NotificationsService,
      SubsystemsService,
      AnalyticsService,
      TasksService,
      AuditService,
      { provide: PrismaService, useValue: db },
      { provide: JwtService, useValue: new JwtService() },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          auth: { accessSecret: "shell-fixture-access-secret" },
        }),
      },
      {
        provide: GoogleIdentityService,
        useValue: {
          verify: async () => {
            throw new Error("Offline fixture");
          },
        },
      },
      {
        provide: getQueueToken("notification-email"),
        useValue: { add: async () => undefined },
      },
      {
        provide: TaskEventsService,
        useValue: {
          emitTaskUpdated: () => undefined,
          emitCommentAdded: () => undefined,
        },
      },
      {
        provide: RedisCacheService,
        useValue: {
          getJson: async (key: string) => cache.get(key) ?? null,
          setJson: async (key: string, value: unknown) => {
            cache.set(key, value);
          },
          del: async (key: string) => {
            cache.delete(key);
          },
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: "http://127.0.0.1:3105" });
  await app.listen(4105, "127.0.0.1");
  writeFileSync(
    "/tmp/antara-phase5-fixture.json",
    JSON.stringify({ schema, catalog }),
  );
  console.log("Phase 5 isolated API fixture listening on 127.0.0.1:4105");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    await db.$disconnect();
    await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await root.$disconnect();
    rmSync(temp, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}
main().catch(() => {
  console.error("Local shell fixture failed");
  process.exitCode = 1;
});
