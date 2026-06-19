-- AddColumn: allowPlayerGive, allowPlayerTake, allowPlayerLoot on Campaign
-- Controls which inventory slash commands players can use.
-- Defaults: give=ON, take=ON, loot=OFF (DM-only by default).
ALTER TABLE "Campaign" ADD COLUMN "allowPlayerGive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Campaign" ADD COLUMN "allowPlayerTake" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Campaign" ADD COLUMN "allowPlayerLoot" BOOLEAN NOT NULL DEFAULT false;
