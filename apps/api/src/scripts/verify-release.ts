import { PrismaClient } from "@prisma/client";
import { bootstrapOptions, verifyLocalResolution } from "./v1-bootstrap-safety";
import { verifyBootstrap } from "./v1-bootstrap-verification";

async function main() {
  const options = bootstrapOptions(
    ["--action", "verify", ...process.argv.slice(2)],
    process.env.PHASE1C_DATABASE_URL,
  );
  if (options.mode === "local")
    await verifyLocalResolution(options.identity.host);
  const db = new PrismaClient({
    datasources: { db: { url: options.url } },
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
  });
  try {
    const foundation = await verifyBootstrap(db, options.userId);
    const storageAndAi = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const counts = await tx.$queryRaw<
        Array<{
          activeOwners: number;
          invalidJobs: number;
          invalidFiles: number;
          legacyFiles: number;
          files: number;
          jobs: number;
        }>
      >`
        SELECT
        (SELECT count(*)::int FROM "User" WHERE role='OWNER' AND "isActive" AND "deletedAt" IS NULL) AS "activeOwners",
        (SELECT count(*)::int FROM "AIJob" WHERE (status='SUCCEEDED' AND (result IS NULL OR "completedAt" IS NULL)) OR (status='RUNNING' AND "startedAt" IS NULL) OR attempts > "maxAttempts") AS "invalidJobs",
        (SELECT count(*)::int FROM "Attachment" WHERE (provenance='VERIFIED' AND (provider IS NULL OR "objectKey" IS NULL OR "objectKey"='' OR "sizeBytes" < 0)) OR ("purgedAt" IS NOT NULL AND "deletedAt" IS NULL)) AS "invalidFiles",
        (SELECT count(*)::int FROM "Attachment" WHERE provenance='LEGACY_UNVERIFIED') AS "legacyFiles",
        (SELECT count(*)::int FROM "Attachment") AS files,
        (SELECT count(*)::int FROM "AIJob") AS jobs`;
      return counts[0]!;
    });
    const ready =
      foundation.ready &&
      storageAndAi.activeOwners > 0 &&
      storageAndAi.invalidJobs === 0 &&
      storageAndAi.invalidFiles === 0;
    console.log(
      JSON.stringify(
        { database: options.identity, ...foundation, storageAndAi, ready },
        null,
        2,
      ),
    );
    if (!ready) process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "RELEASE_VERIFICATION_FAILED: inspect explicit connection, migration history and invariants; no mutation performed",
  );
  process.exitCode = 1;
});
