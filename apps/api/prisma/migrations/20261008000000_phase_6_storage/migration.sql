BEGIN;
CREATE TYPE "StorageProviderKind" AS ENUM ('DRIVE', 'S3');
CREATE TYPE "FileCategory" AS ENUM ('DOCUMENT','MEETING_REPORT','CAD','IMAGE','EXPORT','OTHER');
CREATE TYPE "FileProvenance" AS ENUM ('LEGACY_UNVERIFIED','VERIFIED');
ALTER TABLE "Attachment"
 ADD COLUMN "provider" "StorageProviderKind",
 ADD COLUMN "category" "FileCategory" NOT NULL DEFAULT 'OTHER',
 ADD COLUMN "provenance" "FileProvenance" NOT NULL DEFAULT 'LEGACY_UNVERIFIED',
 ADD COLUMN "objectKey" TEXT,
 ADD COLUMN "bucket" TEXT,
 ADD COLUMN "scopeSubsystemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "deletedAt" TIMESTAMP(3),
 ADD COLUMN "purgeAfter" TIMESTAMP(3),
 ADD COLUMN "purgedAt" TIMESTAMP(3),
 ADD COLUMN "storageError" TEXT,
 ALTER COLUMN "storageUrl" SET DEFAULT '';
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_verified_metadata" CHECK (
 "provenance" = 'LEGACY_UNVERIFIED' OR
 (("provider" IS NOT NULL AND length("objectKey") > 0 AND "sizeBytes" >= 0 AND
 (("provider" = 'DRIVE' AND "bucket" IS NULL AND "category" IN ('DOCUMENT','MEETING_REPORT')) OR
 ("provider" = 'S3' AND length("bucket") > 0 AND "category" IN ('CAD','IMAGE','EXPORT','OTHER')))) IS TRUE)
);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_retention" CHECK (
 ("deletedAt" IS NULL AND "purgeAfter" IS NULL AND "purgedAt" IS NULL) OR
 ("deletedAt" IS NOT NULL AND "purgeAfter" IS NOT NULL AND "purgeAfter" >= "deletedAt")
);
CREATE INDEX "Attachment_deletedAt_purgeAfter_idx" ON "Attachment"("deletedAt", "purgeAfter");
COMMIT;
