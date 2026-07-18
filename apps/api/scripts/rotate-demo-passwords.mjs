import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const fixturePath = path.join(packageDir, "src", "modules", "auth", "demo-users.json");
const outputDir = path.join(packageDir, ".local");
const outputPath = path.join(outputDir, "demo-passwords.txt");
const bcrypt = await import("bcryptjs");
const hashPassword = bcrypt.hash ?? bcrypt.default?.hash;

if (typeof hashPassword !== "function") {
  throw new Error("bcrypt hash function is unavailable");
}

const raw = await readFile(fixturePath, "utf8");
const users = JSON.parse(raw);

const rows = [];

for (const user of users) {
  const password = `OrbitalOps-${randomBytes(10).toString("base64url")}`;
  const passwordHash = await hashPassword(password, 12);
  user.passwordHash = passwordHash;
  rows.push(`${user.id}\t${user.email}\t${password}`);
}

await writeFile(fixturePath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${rows.join("\n")}\n`, "utf8");

console.log(`Updated ${users.length} demo credentials.`);
console.log(`Plaintext passwords written to: ${outputPath}`);
