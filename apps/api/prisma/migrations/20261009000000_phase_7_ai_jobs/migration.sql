CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TABLE "AIJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "operation" TEXT NOT NULL,
  "scopeKind" TEXT NOT NULL,
  "subsystemIds" TEXT[] NOT NULL,
  "sourceRefs" JSONB NOT NULL,
  "input" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "templateVersion" TEXT NOT NULL,
  "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL,
  "nextAttemptAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIJob_operation_check" CHECK ("operation" IN ('SUMMARY', 'INSIGHTS')),
  CONSTRAINT "AIJob_scope_check" CHECK ("scopeKind" IN ('PERSONAL', 'GLOBAL', 'SUBSYSTEMS')),
  CONSTRAINT "AIJob_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= "maxAttempts" AND "maxAttempts" BETWEEN 1 AND 6),
  CONSTRAINT "AIJob_result_check" CHECK (("status" = 'SUCCEEDED') = ("result" IS NOT NULL))
);
CREATE INDEX "AIJob_actorId_createdAt_idx" ON "AIJob"("actorId", "createdAt");
CREATE INDEX "AIJob_status_nextAttemptAt_idx" ON "AIJob"("status", "nextAttemptAt");
