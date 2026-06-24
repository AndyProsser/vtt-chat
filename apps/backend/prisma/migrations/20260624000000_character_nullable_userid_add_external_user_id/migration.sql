-- Make Character.userId nullable to support unowned DM-provisioned stubs.
-- Stubs are created by the DM campaign sync when a player has no VTT-Chat account yet.
-- Once the player connects via the extension, userId is populated (lazy promotion).
ALTER TABLE "Character" ALTER COLUMN "userId" DROP NOT NULL;

-- Add externalUserId to store the DDB user ID for stubs, so the DM panel can
-- display which DDB player a stub belongs to before they connect.
ALTER TABLE "Character" ADD COLUMN "externalUserId" TEXT;

-- Drop the @@index([userId]) index and re-create it to allow nulls (no change in PG,
-- but keeping it explicit for the migration record).
-- PostgreSQL B-tree indexes naturally support NULL values, so no index change needed.
