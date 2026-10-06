-- Controlled authentication cutover. Keep session history, but invalidate ALL old sessions.
-- Deploy with the matching API; old API versions cannot issue/refresh sessions afterward.
BEGIN;
ALTER TABLE "Session" ADD COLUMN "refreshTokenHash" TEXT;
UPDATE "Session" SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP);
ALTER TABLE "Session" DROP COLUMN "refreshToken";
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
ALTER TABLE "Session" ADD CONSTRAINT "Session_credential_integrity" CHECK (
  ("refreshTokenHash" IS NOT NULL AND "refreshTokenHash" ~ '^[a-f0-9]{64}$')
  OR ("refreshTokenHash" IS NULL AND "revokedAt" IS NOT NULL)
);
COMMIT;
