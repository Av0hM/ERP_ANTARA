-- Expand only: no legacy identity, membership, authority, or history is inferred.
BEGIN;
CREATE TYPE "MembershipAccessLevel" AS ENUM ('MEMBER', 'ADMIN');
CREATE TYPE "DecisionScope" AS ENUM ('GLOBAL', 'SUBSYSTEM');
CREATE TYPE "DecisionAuthority" AS ENUM ('OWNER', 'SUBSYSTEM_ADMIN');

ALTER TABLE "Subsystem" ADD COLUMN "key" TEXT;
CREATE UNIQUE INDEX "Subsystem_key_key" ON "Subsystem"("key");

CREATE TABLE "SubsystemMembership" (
    "userId" TEXT NOT NULL,
    "subsystemId" TEXT NOT NULL,
    "accessLevel" "MembershipAccessLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubsystemMembership_pkey" PRIMARY KEY ("userId", "subsystemId"),
    CONSTRAINT "SubsystemMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubsystemMembership_subsystemId_fkey" FOREIGN KEY ("subsystemId") REFERENCES "Subsystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SubsystemMembership_subsystemId_accessLevel_userId_idx"
ON "SubsystemMembership"("subsystemId", "accessLevel", "userId");

ALTER TABLE "DecisionRecord" ADD COLUMN "scope" "DecisionScope",
    ADD COLUMN "authority" "DecisionAuthority";
-- IS TRUE is intentional: PostgreSQL CHECK otherwise accepts UNKNOWN from NULL.
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_scope_authority_check" CHECK ((
    ("scope" IS NULL AND "authority" IS NULL)
    OR ("scope" = 'GLOBAL' AND "authority" = 'OWNER' AND "subsystemId" IS NULL)
    OR ("scope" = 'SUBSYSTEM' AND "authority" IS NOT NULL AND "subsystemId" IS NOT NULL)
) IS TRUE);

-- Prevent even legacy subsystem decisions from silently becoming global on deletion.
-- No records/columns are dropped; this replaces only the FK's deletion action.
ALTER TABLE "DecisionRecord" DROP CONSTRAINT "DecisionRecord_subsystemId_fkey";
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_subsystemId_fkey"
FOREIGN KEY ("subsystemId") REFERENCES "Subsystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
