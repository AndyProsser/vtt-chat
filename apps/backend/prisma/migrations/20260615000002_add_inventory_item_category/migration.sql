CREATE TYPE "InventoryItemCategory" AS ENUM ('EQUIPMENT', 'MAGIC_ITEM', 'HOMEBREW');

ALTER TABLE "InventoryItem"
  ADD COLUMN "srdCategory" "InventoryItemCategory" NOT NULL DEFAULT 'EQUIPMENT';
