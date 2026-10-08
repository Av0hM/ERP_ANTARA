import { cpSync } from "node:fs";
import { spawn } from "node:child_process";
// Match the Docker artifact layout instead of using unsupported `next start`.
cpSync("public", ".next/standalone/apps/web/public", { recursive: true });
cpSync(".next/static", ".next/standalone/apps/web/.next/static", {
  recursive: true,
});
const child = spawn(process.execPath, [".next/standalone/apps/web/server.js"], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
