-- Add InvitationStatus enum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- Create Invitation table
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "subsystemId" TEXT,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");
CREATE INDEX "Invitation_invitedById_idx" ON "Invitation"("invitedById");

-- Add foreign keys
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_subsystemId_fkey" FOREIGN KEY ("subsystemId") REFERENCES "Subsystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;