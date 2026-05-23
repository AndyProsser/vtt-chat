-- CreateEnum
CREATE TYPE "SupportedPlatform" AS ENUM ('ANY', 'DDB', 'ROLL20', 'FOUNDRY');

-- AlterTable
ALTER TABLE "Campaign"
  ADD COLUMN "defaultSessionDurationMins" INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN "supportedPlatforms" "SupportedPlatform"[] DEFAULT ARRAY['ANY']::"SupportedPlatform"[];
