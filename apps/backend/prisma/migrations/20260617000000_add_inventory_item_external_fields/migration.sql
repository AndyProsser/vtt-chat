-- Add EXTERNAL source type for inventory items synced from extensions (e.g. DDB).
-- Also adds the external identity columns and composite lookup index.

ALTER TYPE "InventoryItemSource" ADD VALUE IF NOT EXISTS 'EXTERNAL';

ALTER TABLE "InventoryItem"
  ADD COLUMN IF NOT EXISTS "externalId"     TEXT,
  ADD COLUMN IF NOT EXISTS "externalSource" TEXT;

CREATE INDEX IF NOT EXISTS "InventoryItem_campaignId_ownerId_externalSource_externalId_idx"
  ON "InventoryItem" ("campaignId", "ownerId", "externalSource", "externalId");
