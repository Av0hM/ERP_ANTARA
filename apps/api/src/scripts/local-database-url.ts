/** Tooling never falls back to DATABASE_URL or loads the repository .env. */
export function requireLocalDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("An explicit local PostgreSQL URL is required.");
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.searchParams.has("host")
  ) {
    throw new Error(
      "Phase 1A tooling accepts loopback PostgreSQL only. Use an isolated local copy, never production.",
    );
  }
  return url.toString();
}
