-- Persist campaign poster image across users by storing data URL on campaign.
ALTER TABLE "Campaign"
ADD COLUMN "posterUrl" TEXT;
