import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "/tmp/antara-phase5-playwright-results",
  testMatch: ["shell.spec.ts", "people.spec.ts"],
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3105",
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.PHASE5_CHROMIUM_PATH || "/usr/bin/chromium",
    },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "../..//node_modules/.bin/ts-node --project ../api/tsconfig.json ../api/test/phase5-server.ts",
      url: "http://127.0.0.1:4105/api/auth/me",
      timeout: 120000,
      reuseExistingServer: false,
      env: { NODE_ENV: "test" },
    },
    {
      command: "node scripts/start-standalone.mjs",
      url: "http://127.0.0.1:3105/login",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        HOSTNAME: "127.0.0.1",
        PORT: "3105",
        NEXTAUTH_URL: "http://127.0.0.1:3105",
        NEXTAUTH_SECRET: "phase5-local-browser-fixture-secret",
        API_URL: "http://127.0.0.1:4105/api",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:4105/api",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      },
    },
  ],
});
