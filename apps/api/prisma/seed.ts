import { PrismaClient } from "@prisma/client";
import { provisionCanonicalSubsystems } from "../src/scripts/provision-canonical-subsystems";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Use explicit bootstrap:v1 operator provisioning in production",
    );
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Explicit DATABASE_URL is required; no default database is used.",
    );
  const prisma = new PrismaClient();
  try {
    const subsystems = await provisionCanonicalSubsystems(prisma);
    console.log(
      `Canonical subsystems provisioned: ${subsystems.map(({ key }) => key).join(", ")}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Canonical provisioning failed. Check schema and run preflight:v1 for legacy/conflicting data. No accounts are provisioned.",
  );
  process.exitCode = 1;
});
