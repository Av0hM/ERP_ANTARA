-- Add DecisionRecord model and DecisionStatus enum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'DEFERRED');

CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "alternatives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consequences" TEXT,
    "authorId" TEXT NOT NULL,
    "subsystemId" TEXT,
    "relatedTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecisionRecord_supersededById_key" ON "DecisionRecord"("supersededById");
CREATE INDEX "DecisionRecord_status_createdAt_idx" ON "DecisionRecord"("status", "createdAt");
CREATE INDEX "DecisionRecord_subsystemId_idx" ON "DecisionRecord"("subsystemId");
CREATE INDEX "DecisionRecord_authorId_idx" ON "DecisionRecord"("authorId");

ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_subsystemId_fkey" FOREIGN KEY ("subsystemId") REFERENCES "Subsystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "DecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;