import { defineConfig } from "@playwright/test";
import shell from "./playwright.shell.config";
// Reuse real authenticated PostgreSQL fixtures and offline providers; no role-only mocks.
export default defineConfig({
  ...shell,
  grep: /release OWNER|OWNER branding|mixed ADMIN|MEMBER personal|stored unauthorized|notifications support|logout revokes|revoked backend|Phase 6 Files:|Phase 6 MEMBER|AI summary uses/,
  outputDir: "/tmp/antara-release-smoke-results",
});
