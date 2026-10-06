import { PrismaClient } from "@prisma/client";
import { requireLocalDatabaseUrl } from "./local-database-url";
import { inventoryV1 } from "./v1-preflight-inventory";

async function main() {
  const url = requireLocalDatabaseUrl(process.env.V1_PREFLIGHT_DATABASE_URL);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    console.log(JSON.stringify(await inventoryV1(prisma), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Prisma connection errors can contain credentials; never dump them to reports.
  console.error(
    "Preflight failed. Supply V1_PREFLIGHT_DATABASE_URL for a local migrated database; no writes are performed.",
  );
  process.exitCode = 1;
});
