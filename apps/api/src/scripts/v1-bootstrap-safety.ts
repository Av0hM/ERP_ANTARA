import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireLocalDatabaseUrl } from "./local-database-url";

export function bootstrapOptions(
  args: string[],
  databaseUrl: string | undefined,
) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      !key ||
      !["--action", "--mode", "--user-id", "--ack"].includes(key) ||
      !value ||
      value.startsWith("--") ||
      values.has(key)
    )
      throw new Error(
        "Explicit action, mode, user-id and acknowledgement required",
      );
    values.set(key, value);
  }
  const action = values.get("--action");
  const mode = values.get("--mode");
  const userId = values.get("--user-id");
  if (
    !action ||
    !["verify", "provision", "owner"].includes(action) ||
    !userId?.trim() ||
    !["local", "production"].includes(mode ?? "")
  )
    throw new Error("Explicit action, mode and user-id required");
  if (
    values.get("--ack") !==
    (mode === "production" ? "PRODUCTION_BOOTSTRAP" : "LOCAL_RESTORE_BOOTSTRAP")
  )
    throw new Error("Explicit environment acknowledgement required");
  if (!databaseUrl)
    throw new Error(
      "PHASE1C_DATABASE_URL is required; no fallback is permitted",
    );
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid explicit database URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.pathname.slice(1) ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode")
  )
    throw new Error("Unsupported database URL or connection override");
  if (mode === "local") requireLocalDatabaseUrl(databaseUrl);
  return {
    action,
    mode,
    userId,
    url: url.toString(),
    identity: {
      host: url.hostname,
      port: url.port || "5432",
      database: decodeURIComponent(url.pathname.slice(1)),
    },
  };
}

export async function verifyLocalResolution(host: string) {
  const bare = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(bare)
    ? [{ address: bare }]
    : await lookup(bare, { all: true });
  if (
    !addresses.length ||
    addresses.some(
      ({ address }) => address !== "127.0.0.1" && address !== "::1",
    )
  )
    throw new Error("Local database host must resolve exclusively to loopback");
}
