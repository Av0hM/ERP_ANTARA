import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "ux-error.spec.ts",
  outputDir: "/tmp/antara-ux-unit-results",
  workers: 1,
});
