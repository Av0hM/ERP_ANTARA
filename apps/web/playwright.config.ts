import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: {
    command: "node ../../scripts/start-web-e2e.mjs",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXTAUTH_URL: "http://localhost:3100",
      NEXTAUTH_SECRET: "0FQ/E0GuRdvjAqB1QsbosER7I7Yx9zKHL2RHDqoMdLg=",
      API_URL: process.env.API_URL ?? "http://localhost:4000/api",
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
    },
  },
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
});
