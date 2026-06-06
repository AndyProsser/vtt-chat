-- Migration: notes-campaign-scoped
-- Notes are campaign-bound, not session-bound.
-- Adds a direct campaignId FK to Note, makes sessionId optional.

-- Step 1: Add campaignId as nullable
ALTER TABLE "Note" ADD COLUMN "campaignId" UUID;

-- Step 2: Populate campaignId from the linked session
UPDATE "Note" n
SET "campaignId" = s."campaignId"
FROM "Session" s
WHERE n."sessionId" = s.id
AND s."campaignId" IS NOT NULL;

-- Step 3: Make campaignId NOT NULL (all existing notes now have it from step 2)
ALTER TABLE "Note" ALTER COLUMN "campaignId" SET NOT NULL;

-- Step 4: Make sessionId nullable
ALTER TABLE "Note" ALTER COLUMN "sessionId" DROP NOT NULL;

-- Step 5: Drop old CASCADE FK on sessionId, re-add as SET NULL
ALTER TABLE "Note" DROP CONSTRAINT IF EXISTS "Note_sessionId_fkey";
ALTER TABLE "Note" ADD CONSTRAINT "Note_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: Add FK for campaignId → Campaign
ALTER TABLE "Note" ADD CONSTRAINT "Note_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Add index on campaignId
CREATE INDEX "Note_campaignId_idx" ON "Note"("campaignId");
