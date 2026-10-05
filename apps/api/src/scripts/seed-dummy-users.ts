import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { dummyCredentialsPath, readDummyCredentials } from "../modules/auth/dummy-credentials";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Dummy seeding is disabled in production");
  if (!existsSync(dummyCredentialsPath())) {
    console.log("No dummy-credentials.local.json; nothing to seed.");
    return;
  }
  const users = readDummyCredentials();
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      for (const entry of users) {
        const existing = await tx.user.findUnique({ where: { email: entry.email } });
        if (existing && !existing.isDummySeed) throw new Error(`Refusing to overwrite a non-dummy user: ${entry.email}`);
        const data = {
          email: entry.email,
          name: entry.name,
          role: entry.role,
          passwordHash: await bcrypt.hash(entry.password, 12),
          isDummySeed: true,
        };
        await tx.user.upsert({ where: { email: entry.email }, create: data, update: data });
      }
    }, { timeout: 30000 });
    console.log(`Seeded ${users.length} dummy users.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Dummy seeding failed");
  process.exitCode = 1;
});
