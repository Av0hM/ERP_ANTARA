import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { SessionService } from "../common/sessions/session.service";
import { bootstrapOptions, verifyLocalResolution } from "./v1-bootstrap-safety";
import { bootstrapInitialOwner } from "./v1-owner-bootstrap";
import { provisionCanonicalSubsystems } from "./provision-canonical-subsystems";
import { verifyBootstrap } from "./v1-bootstrap-verification";

async function main() {
  const options = bootstrapOptions(
    process.argv.slice(2),
    process.env.PHASE1C_DATABASE_URL,
  );
  if (options.mode === "local")
    await verifyLocalResolution(options.identity.host);
  console.log(
    JSON.stringify({
      mode: options.mode,
      action: options.action,
      database: options.identity,
      userId: options.userId,
    }),
  );
  const prisma = new PrismaClient({
    datasources: { db: { url: options.url } },
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
  });
  try {
    // Verifies hashes before any write. Never runs migrations or reads .env.
    const before = await verifyBootstrap(prisma, options.userId);
    if (
      options.mode === "local" &&
      before.server.some(
        (s) => !["127.0.0.1/32", "::1/128"].includes(s.address),
      )
    )
      throw new Error("Server is not loopback PostgreSQL");
    if (options.action === "provision")
      await provisionCanonicalSubsystems(prisma);
    if (options.action === "owner") {
      const sessions = new SessionService(
        prisma,
        new JwtService(),
        new ConfigService({}),
      );
      console.log(
        JSON.stringify(
          await bootstrapInitialOwner(prisma, sessions, options.userId),
        ),
      );
    }
    const result =
      options.action === "verify"
        ? before
        : await verifyBootstrap(prisma, options.userId);
    console.log(JSON.stringify(result, null, 2));
    if (options.action === "verify" && !result.ready) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  // Prisma errors may contain connection details. Never echo raw exceptions.
  console.error(
    "V1 bootstrap failed. Check explicit arguments, migration checksums, target account and existing OWNER/catalog state. No success is claimed; inspect with the read-only verify command.",
  );
  process.exitCode = 1;
});
