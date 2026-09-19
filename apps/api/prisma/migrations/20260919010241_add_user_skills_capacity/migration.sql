-- Add skills and weeklyCapacityHours to User model
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "weeklyCapacityHours" INTEGER DEFAULT 20;