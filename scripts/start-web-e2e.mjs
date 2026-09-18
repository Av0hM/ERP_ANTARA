import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "..");
const webDir = path.join(repoRoot, "apps", "web");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

async function run(commandLine, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${commandLine} exited with code ${code}`));
      }
    });
  });
}

await run(`${npmCmd} run build --workspace @antara/web`);

const server = spawn(`${npmCmd} run start --workspace @antara/web -- --port 3100`, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PORT: "3100",
  },
});

const shutdown = async () => {
  server.kill("SIGTERM");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", (code) => process.exit(code ?? 0));

