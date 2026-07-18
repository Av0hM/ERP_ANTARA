import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { AppRole } from "@antara/contracts";

type DemoCredentialUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  passwordHash: string;
};

const fixturePaths = [
  path.join(__dirname, "demo-users.json"),
  path.join(process.cwd(), "src", "modules", "auth", "demo-users.json"),
  path.join(process.cwd(), "dist", "modules", "auth", "demo-users.json"),
];

let cache: DemoCredentialUser[] | null = null;

async function loadDemoCredentialUsers(): Promise<DemoCredentialUser[]> {
  if (cache) {
    return cache;
  }

  for (const fixturePath of fixturePaths) {
    if (!existsSync(fixturePath)) {
      continue;
    }

    const raw = await readFile(fixturePath, "utf8");
    const parsed = JSON.parse(raw) as DemoCredentialUser[];
    cache = parsed;
    return parsed;
  }

  cache = [];
  return [];
}

export async function findDemoCredentialUser(email: string): Promise<DemoCredentialUser | null> {
  const users = await loadDemoCredentialUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((user) => user.email.trim().toLowerCase() === normalized) ?? null;
}

