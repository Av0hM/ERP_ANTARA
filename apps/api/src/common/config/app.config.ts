export const appConfig = () => ({
  app: {
    port: Number(process.env.PORT ?? 4000),
    frontendUrl: process.env.FRONTEND_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
    accessTtl: "15m",
    refreshTtl: "7d",
  },
  integrations: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID,
    googleDriveRootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
    googleProjectId: process.env.GOOGLE_PROJECT_ID,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
});
