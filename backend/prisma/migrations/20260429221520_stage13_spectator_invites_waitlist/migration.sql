-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('FULL', 'GUEST');

-- CreateEnum
CREATE TYPE "SpectatorPolicy" AS ENUM ('NONE', 'GUESTS', 'USERS');

-- CreateEnum
CREATE TYPE "ExtensionSyncPolicy" AS ENUM ('NONE', 'DM_ONLY', 'DM_AND_PLAYERS');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "discoverable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extensionSyncPolicy" "ExtensionSyncPolicy" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "inviteActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spectatorInviteActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spectatorInviteCode" TEXT,
ADD COLUMN     "spectatorMax" INTEGER,
ADD COLUMN     "spectatorPolicy" "SpectatorPolicy" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "spectatorReconnectGraceSecs" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "spectatorWaitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalSystem" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authType" "AuthType" NOT NULL DEFAULT 'FULL';

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "externalSystem" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignExternalLink" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "externalSystem" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedBy" UUID NOT NULL,

    CONSTRAINT "CampaignExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpectatorWaitlist" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waitlistToken" TEXT NOT NULL,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "promotedAt" TIMESTAMP(3),

    CONSTRAINT "SpectatorWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalIdentity_email_idx" ON "ExternalIdentity"("email");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_externalSystem_externalUserId_key" ON "ExternalIdentity"("externalSystem", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_userId_externalSystem_key" ON "ExternalIdentity"("userId", "externalSystem");

-- CreateIndex
CREATE INDEX "CampaignExternalLink_externalSystem_externalId_idx" ON "CampaignExternalLink"("externalSystem", "externalId");

-- CreateIndex
CREATE INDEX "CampaignExternalLink_linkedBy_idx" ON "CampaignExternalLink"("linkedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignExternalLink_campaignId_externalSystem_key" ON "CampaignExternalLink"("campaignId", "externalSystem");

-- CreateIndex
CREATE UNIQUE INDEX "SpectatorWaitlist_waitlistToken_key" ON "SpectatorWaitlist"("waitlistToken");

-- CreateIndex
CREATE INDEX "SpectatorWaitlist_campaignId_joinedAt_idx" ON "SpectatorWaitlist"("campaignId", "joinedAt");

-- CreateIndex
CREATE INDEX "SpectatorWaitlist_waitlistToken_idx" ON "SpectatorWaitlist"("waitlistToken");

-- CreateIndex
CREATE UNIQUE INDEX "SpectatorWaitlist_campaignId_userId_key" ON "SpectatorWaitlist"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_spectatorInviteCode_key" ON "Campaign"("spectatorInviteCode");

-- CreateIndex
CREATE INDEX "Campaign_discoverable_idx" ON "Campaign"("discoverable");

-- CreateIndex
CREATE INDEX "Campaign_spectatorPolicy_idx" ON "Campaign"("spectatorPolicy");

-- CreateIndex
CREATE INDEX "Character_externalSystem_externalId_idx" ON "Character"("externalSystem", "externalId");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExternalLink" ADD CONSTRAINT "CampaignExternalLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignExternalLink" ADD CONSTRAINT "CampaignExternalLink_linkedBy_fkey" FOREIGN KEY ("linkedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpectatorWaitlist" ADD CONSTRAINT "SpectatorWaitlist_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpectatorWaitlist" ADD CONSTRAINT "SpectatorWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

