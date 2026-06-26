-- AddColumn: isContainer, containerId, metadata to InventoryItem
ALTER TABLE "InventoryItem" ADD COLUMN "isContainer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventoryItem" ADD COLUMN "containerId" UUID;
ALTER TABLE "InventoryItem" ADD COLUMN "metadata" JSONB;

-- Index for efficient container child lookups
CREATE INDEX "InventoryItem_campaignId_containerId_idx" ON "InventoryItem"("campaignId", "containerId");
