import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const credentialsSchema = z.object({
  users: z.array(z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().email().transform((email) => email.toLowerCase()),
    password: z.string().min(8),
    role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  })).refine((users) => new Set(users.map((user) => user.email)).size === users.length),
});

export function dummyCredentialsPath(): string {
  // Works from the repo root, npm workspace cwd, and compiled API output.
  let directory = process.cwd();
  while (!existsSync(join(directory, "apps/api/prisma/schema.prisma"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Cannot locate repository root");
    directory = parent;
  }
  return join(directory, "dummy-credentials.local.json");
}

export function readDummyCredentials() {
  return credentialsSchema.parse(JSON.parse(readFileSync(dummyCredentialsPath(), "utf8"))).users;
}

export function dummyLoginAllowed(user: { email: string; isDummySeed?: boolean }): boolean {
  if (process.env.NODE_ENV === "production" || process.env.ENFORCE_DUMMY_ALLOWLIST !== "true" || !user.isDummySeed) {
    return true;
  }
  try {
    return readDummyCredentials().some((entry) => entry.email === user.email.trim().toLowerCase());
  } catch {
    return false;
  }
}
