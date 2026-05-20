-- CreateEnum
CREATE TYPE "CampaignJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DmVoiceMode" AS ENUM ('TARGET_GROUP', 'BROADCAST');

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'DM';

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_campaignId_fkey";

-- DropIndex
DROP INDEX "ChatMessage_campaignId_createdAt_idx";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "isOffTheRecord" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dmBackgroundVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
ADD COLUMN     "dmVoiceMode" "DmVoiceMode" NOT NULL DEFAULT 'TARGET_GROUP';

-- CreateTable
CREATE TABLE "CampaignJoinRequest" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "message" VARCHAR(300),
    "status" "CampaignJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignJoinRequest_campaignId_idx" ON "CampaignJoinRequest"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignJoinRequest_userId_idx" ON "CampaignJoinRequest"("userId");

-- CreateIndex
CREATE INDEX "CampaignJoinRequest_status_idx" ON "CampaignJoinRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignJoinRequest_campaignId_userId_key" ON "CampaignJoinRequest"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "Campaign_retiredAt_idx" ON "Campaign"("retiredAt");

-- CreateIndex
CREATE INDEX "ChatMessage_campaignId_idx" ON "ChatMessage"("campaignId");

-- AddForeignKey
ALTER TABLE "CampaignJoinRequest" ADD CONSTRAINT "CampaignJoinRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignJoinRequest" ADD CONSTRAINT "CampaignJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
