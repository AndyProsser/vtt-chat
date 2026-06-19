-- CreateEnum
CREATE TYPE "InventoryItemSource" AS ENUM ('SRD', 'CUSTOM');

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source" "InventoryItemSource" NOT NULL DEFAULT 'CUSTOM',
    "srdKey" TEXT,
    "notes" TEXT,
    "addedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyWallet" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" UUID,
    "cp" INTEGER NOT NULL DEFAULT 0,
    "sp" INTEGER NOT NULL DEFAULT 0,
    "ep" INTEGER NOT NULL DEFAULT 0,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "pp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryHistoryEntry" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "itemId" UUID,
    "sessionId" UUID,
    "actorUserId" UUID NOT NULL,
    "actionType" TEXT NOT NULL,
    "fromOwnerType" TEXT,
    "fromOwnerId" UUID,
    "toOwnerType" TEXT,
    "toOwnerId" UUID,
    "quantity" INTEGER,
    "currencyDelta" JSONB,
    "itemName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItem_campaignId_idx" ON "InventoryItem"("campaignId");
CREATE INDEX "InventoryItem_campaignId_ownerType_idx" ON "InventoryItem"("campaignId", "ownerType");
CREATE INDEX "InventoryItem_campaignId_ownerId_idx" ON "InventoryItem"("campaignId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyWallet_campaignId_ownerType_ownerId_key" ON "CurrencyWallet"("campaignId", "ownerType", "ownerId");
CREATE INDEX "CurrencyWallet_campaignId_idx" ON "CurrencyWallet"("campaignId");

-- CreateIndex
CREATE INDEX "InventoryHistoryEntry_campaignId_idx" ON "InventoryHistoryEntry"("campaignId");
CREATE INDEX "InventoryHistoryEntry_campaignId_sessionId_idx" ON "InventoryHistoryEntry"("campaignId", "sessionId");
CREATE INDEX "InventoryHistoryEntry_campaignId_actorUserId_idx" ON "InventoryHistoryEntry"("campaignId", "actorUserId");
CREATE INDEX "InventoryHistoryEntry_itemId_idx" ON "InventoryHistoryEntry"("itemId");
CREATE INDEX "InventoryHistoryEntry_createdAt_idx" ON "InventoryHistoryEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyWallet" ADD CONSTRAINT "CurrencyWallet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHistoryEntry" ADD CONSTRAINT "InventoryHistoryEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHistoryEntry" ADD CONSTRAINT "InventoryHistoryEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
