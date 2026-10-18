import path from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "backend-auth.spec.ts",
    "backend-sign-in.spec.ts",
    "oauth-issuer.spec.ts",
    "login-cooldown.spec.ts",
    "auth-feedback.spec.ts",
  ],
  outputDir: "/tmp/antara-auth-ux-results",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3110",
    launchOptions: {
      executablePath: process.env.PHASE5_CHROMIUM_PATH || "/usr/bin/chromium",
    },
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3110",
    url: "http://127.0.0.1:3110/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXTAUTH_URL: "http://127.0.0.1:3110",
      NEXTAUTH_SECRET: "auth-ux-local-test-fixture-only-secret",
      API_URL: "http://127.0.0.1:1/api",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:1/api",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.resolve(
        __dirname,
        "tests/fixtures/auth-fonts.cjs",
      ),
    },
  },
});
