-- Expand only: existing accounts and invitation links retain their meaning.
ALTER TABLE "User" ADD COLUMN "onboardingPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD CONSTRAINT "User_pending_role_check" CHECK (NOT "onboardingPending" OR "role" = 'MEMBER');
ALTER TABLE "Invitation" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "Invitation" ADD COLUMN "tokenHash" TEXT;
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_token_representation_check" CHECK (
  ("token" IS NOT NULL AND "tokenHash" IS NULL) OR
  ("token" IS NULL AND "tokenHash" IS NOT NULL AND "tokenHash" ~ '^[a-f0-9]{64}$' AND "role" IN ('MEMBER', 'OWNER') AND "subsystemId" IS NULL)
);
CREATE TABLE "InvitationGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invitationId" TEXT NOT NULL,
  "subsystemId" TEXT NOT NULL,
  "accessLevel" "MembershipAccessLevel" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvitationGrant_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InvitationGrant_subsystemId_fkey" FOREIGN KEY ("subsystemId") REFERENCES "Subsystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvitationGrant_invitationId_subsystemId_key" ON "InvitationGrant"("invitationId", "subsystemId");
CREATE INDEX "InvitationGrant_subsystemId_accessLevel_idx" ON "InvitationGrant"("subsystemId", "accessLevel");
-- Membership writers and onboarding transitions lock the same User row.
CREATE FUNCTION "check_pending_membership"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "User" WHERE id = NEW."userId" FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "User" WHERE id = NEW."userId" AND "onboardingPending") THEN
    RAISE EXCEPTION 'Pending onboarding account cannot hold membership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SubsystemMembership_pending_check" BEFORE INSERT OR UPDATE ON "SubsystemMembership" FOR EACH ROW EXECUTE FUNCTION "check_pending_membership"();
CREATE FUNCTION "check_pending_user"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."onboardingPending" AND EXISTS (SELECT 1 FROM "SubsystemMembership" WHERE "userId" = NEW.id) THEN
    RAISE EXCEPTION 'Pending onboarding account cannot hold membership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "User_pending_membership_check" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION "check_pending_user"();
