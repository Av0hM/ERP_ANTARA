import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const source = path.join(packageDir, "src", "modules", "auth", "demo-users.json");
const target = path.join(packageDir, "dist", "modules", "auth", "demo-users.json");

await mkdir(path.dirname(target), { recursive: true });
await copyFile(source, target);
