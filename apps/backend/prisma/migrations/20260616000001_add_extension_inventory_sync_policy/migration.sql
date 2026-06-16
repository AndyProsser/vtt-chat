-- CreateEnum
CREATE TYPE "ExtensionPartyInventorySyncAccess" AS ENUM ('DISABLED', 'DM_ONLY', 'ALL_PLAYERS');

-- CreateEnum
CREATE TYPE "ExtensionSyncConflictResolution" AS ENUM ('OVERWRITE', 'IGNORE', 'PROMPT');

-- CreateEnum
CREATE TYPE "PendingExtensionSyncKind" AS ENUM ('ITEM', 'CURRENCY');

-- AlterTable
ALTER TABLE "Campaign"
  ADD COLUMN "extensionInventorySyncEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "extensionCurrencySyncEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "extensionPartyInventorySyncAccess" "ExtensionPartyInventorySyncAccess" NOT NULL DEFAULT 'DM_ONLY',
  ADD COLUMN "extensionSyncConflictResolution" "ExtensionSyncConflictResolution" NOT NULL DEFAULT 'OVERWRITE';

-- CreateTable
CREATE TABLE "PendingExtensionSync" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "externalSource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "PendingExtensionSyncKind" NOT NULL,
    "incomingPayload" JSONB NOT NULL,
    "existingSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingExtensionSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingExtensionSync_campaignId_idx" ON "PendingExtensionSync"("campaignId");

-- CreateIndex
CREATE INDEX "PendingExtensionSync_campaignId_expiresAt_idx" ON "PendingExtensionSync"("campaignId", "expiresAt");

-- CreateIndex
CREATE INDEX "PendingExtensionSync_characterId_idx" ON "PendingExtensionSync"("characterId");

-- AddForeignKey
ALTER TABLE "PendingExtensionSync" ADD CONSTRAINT "PendingExtensionSync_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
