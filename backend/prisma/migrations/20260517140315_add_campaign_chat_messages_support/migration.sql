-- Add campaignId support to ChatMessage
-- Allows greenroom messages to be stored at campaign level
-- Session chat messages retain sessionId, greenroom messages use campaignId only

-- Make sessionId nullable
ALTER TABLE "ChatMessage" ALTER COLUMN "sessionId" DROP NOT NULL;

-- Add campaignId column
ALTER TABLE "ChatMessage" ADD COLUMN "campaignId" UUID;

-- Add foreign key to Campaign
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE;

-- Add index for campaign-scoped queries
CREATE INDEX "ChatMessage_campaignId_createdAt_idx" ON "ChatMessage"("campaignId", "createdAt");

-- Update existing indexes to be more efficient
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt") WHERE "sessionId" IS NOT NULL;
