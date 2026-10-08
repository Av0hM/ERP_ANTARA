import { readdir, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Explicit offline cleanup only: never race an active upload or follow symlinks.
if (process.argv.slice(2).join(" ") !== "--ack API_WRITERS_STOPPED") {
  console.error(
    "Usage: node infra/scripts/cleanup-upload-temp.mjs --ack API_WRITERS_STOPPED",
  );
  process.exitCode = 1;
} else {
  let removed = 0;
  for (const entry of await readdir(tmpdir(), { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !/^antara-multipart-[A-Za-z0-9]{6}$/.test(entry.name)
    )
      continue;
    const path = join(tmpdir(), entry.name);
    const stat = await lstat(path);
    if (
      stat.isSymbolicLink() ||
      (process.getuid && stat.uid !== process.getuid()) ||
      Date.now() - stat.mtimeMs < 86400000
    )
      continue;
    await rm(path, { recursive: true });
    removed++;
  }
  console.log(JSON.stringify({ removed, minimumAgeHours: 24 }));
}
