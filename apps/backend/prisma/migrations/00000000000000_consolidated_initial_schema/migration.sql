-- Migration: 20260429000000_initial
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DM', 'PLAYER', 'SPECTATOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('IC', 'OOC', 'WHISPER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('IDLE', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('DM_ONLY', 'PLAYERS_VISIBLE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('ALIVE', 'DEAD', 'LEFT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('MAIN', 'GROUP', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PresenceState" AS ENUM ('ONLINE', 'TYPING', 'SPEAKING', 'IDLE', 'OFFLINE');

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "campaignId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dmId" UUID NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'MAIN',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceSnapshot" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "campaignId" UUID,
    "userId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "primaryRoomId" UUID,
    "privateRoomId" UUID,
    "state" "PresenceState" NOT NULL DEFAULT 'ONLINE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "currentDmId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMembership" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CharacterStatus" NOT NULL DEFAULT 'ALIVE',
    "race" TEXT,
    "class" TEXT,
    "subclass" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionMember" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorUsername" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "isDmOnly" BOOLEAN NOT NULL DEFAULT false,
    "visibleTo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorUsername" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'DM_ONLY',
    "tags" JSONB,
    "allowedUsers" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_dmId_idx" ON "Session"("dmId");

-- CreateIndex
CREATE INDEX "Session_campaignId_idx" ON "Session"("campaignId");

-- CreateIndex
CREATE INDEX "Session_state_idx" ON "Session"("state");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");

-- CreateIndex
CREATE INDEX "Room_sessionId_idx" ON "Room"("sessionId");

-- CreateIndex
CREATE INDEX "Room_type_idx" ON "Room"("type");

-- CreateIndex
CREATE INDEX "Room_createdAt_idx" ON "Room"("createdAt");

-- CreateIndex
CREATE INDEX "PresenceSnapshot_sessionId_idx" ON "PresenceSnapshot"("sessionId");

-- CreateIndex
CREATE INDEX "PresenceSnapshot_campaignId_idx" ON "PresenceSnapshot"("campaignId");

-- CreateIndex
CREATE INDEX "PresenceSnapshot_userId_idx" ON "PresenceSnapshot"("userId");

-- CreateIndex
CREATE INDEX "PresenceSnapshot_lastSeenAt_idx" ON "PresenceSnapshot"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceSnapshot_sessionId_userId_key" ON "PresenceSnapshot"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_inviteCode_key" ON "Campaign"("inviteCode");

-- CreateIndex
CREATE INDEX "Campaign_currentDmId_idx" ON "Campaign"("currentDmId");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignMembership_campaignId_idx" ON "CampaignMembership"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMembership_userId_idx" ON "CampaignMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMembership_campaignId_userId_key" ON "CampaignMembership"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "Character_campaignId_idx" ON "Character"("campaignId");

-- CreateIndex
CREATE INDEX "Character_campaignId_userId_idx" ON "Character"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "SessionMember_sessionId_idx" ON "SessionMember"("sessionId");

-- CreateIndex
CREATE INDEX "SessionMember_userId_idx" ON "SessionMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionMember_sessionId_userId_key" ON "SessionMember"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_type_idx" ON "ChatMessage"("type");

-- CreateIndex
CREATE INDEX "Note_sessionId_idx" ON "Note"("sessionId");

-- CreateIndex
CREATE INDEX "Note_authorId_idx" ON "Note"("authorId");

-- CreateIndex
CREATE INDEX "Note_visibility_idx" ON "Note"("visibility");

-- CreateIndex
CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceSnapshot" ADD CONSTRAINT "PresenceSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_currentDmId_fkey" FOREIGN KEY ("currentDmId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CreateEnum
CREATE TYPE "SessionLogEventType" AS ENUM ('JOINED', 'LEFT', 'STATE_CHANGED');

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID,
    "username" TEXT NOT NULL,
    "eventType" "SessionLogEventType" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionLog_sessionId_idx" ON "SessionLog"("sessionId");

-- CreateIndex
CREATE INDEX "SessionLog_userId_idx" ON "SessionLog"("userId");

-- CreateIndex
CREATE INDEX "SessionLog_eventType_idx" ON "SessionLog"("eventType");

-- CreateIndex
CREATE INDEX "SessionLog_createdAt_idx" ON "SessionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CAMPAIGN_DM', 'READ_ONLY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRole" "AdminRole",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password" TEXT;

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_adminRole_idx" ON "User"("adminRole");
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenInvalidBefore" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_idx" ON "AdminAuditLog"("targetType");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
-- CreateTable
CREATE TABLE "AdminInvite" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "invitedRole" "AdminRole" NOT NULL,
    "email" TEXT,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_token_key" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_token_idx" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_invitedByUserId_idx" ON "AdminInvite"("invitedByUserId");

-- CreateIndex
CREATE INDEX "AdminInvite_expiresAt_idx" ON "AdminInvite"("expiresAt");
-- CreateEnum
CREATE TYPE "PortabilityArtifactType" AS ENUM ('CAMPAIGN_EXPORT', 'CAMPAIGN_IMPORT', 'OPERATIONS_EXPORT');

-- CreateTable
CREATE TABLE "RecordingMetadata" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "sessionId" UUID,
    "roomId" UUID,
    "title" TEXT NOT NULL,
    "storageKey" TEXT,
    "sourceUrl" TEXT,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "journalSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportExportArtifact" (
    "id" UUID NOT NULL,
    "type" "PortabilityArtifactType" NOT NULL,
    "campaignId" UUID,
    "createdByUserId" UUID,
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportExportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordingMetadata_campaignId_idx" ON "RecordingMetadata"("campaignId");

-- CreateIndex
CREATE INDEX "RecordingMetadata_sessionId_idx" ON "RecordingMetadata"("sessionId");

-- CreateIndex
CREATE INDEX "RecordingMetadata_roomId_idx" ON "RecordingMetadata"("roomId");

-- CreateIndex
CREATE INDEX "RecordingMetadata_createdAt_idx" ON "RecordingMetadata"("createdAt");

-- CreateIndex
CREATE INDEX "ImportExportArtifact_type_idx" ON "ImportExportArtifact"("type");

-- CreateIndex
CREATE INDEX "ImportExportArtifact_campaignId_idx" ON "ImportExportArtifact"("campaignId");

-- CreateIndex
CREATE INDEX "ImportExportArtifact_createdByUserId_idx" ON "ImportExportArtifact"("createdByUserId");

-- CreateIndex
CREATE INDEX "ImportExportArtifact_createdAt_idx" ON "ImportExportArtifact"("createdAt");

-- AddForeignKey
ALTER TABLE "RecordingMetadata" ADD CONSTRAINT "RecordingMetadata_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingMetadata" ADD CONSTRAINT "RecordingMetadata_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingMetadata" ADD CONSTRAINT "RecordingMetadata_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportExportArtifact" ADD CONSTRAINT "ImportExportArtifact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportExportArtifact" ADD CONSTRAINT "ImportExportArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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


-- Migration: 20260502000000_add_audio_room_state_and_dm_override
-- CreateTable
CREATE TABLE "AudioRoomState" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "environmentName" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "parameters" JSONB,
    "setBy" UUID NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioRoomState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioDMOverride" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "overrideType" TEXT NOT NULL,
    "parameters" JSONB,
    "appliedBy" UUID NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioDMOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioRoomState_sessionId_roomId_key" ON "AudioRoomState"("sessionId", "roomId");

-- CreateIndex
CREATE INDEX "AudioRoomState_sessionId_idx" ON "AudioRoomState"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioDMOverride_sessionId_targetUserId_overrideType_key" ON "AudioDMOverride"("sessionId", "targetUserId", "overrideType");

-- CreateIndex
CREATE INDEX "AudioDMOverride_sessionId_idx" ON "AudioDMOverride"("sessionId");

-- CreateIndex
CREATE INDEX "AudioDMOverride_targetUserId_idx" ON "AudioDMOverride"("targetUserId");

-- AddForeignKey
ALTER TABLE "AudioRoomState" ADD CONSTRAINT "AudioRoomState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioDMOverride" ADD CONSTRAINT "AudioDMOverride_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: 20260504045049_campaign_late_join_and_settings_fields
-- CreateEnum
CREATE TYPE "LateJoinPolicy" AS ENUM ('OPEN', 'SCREENED', 'BLOCKED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "lateJoinGraceMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "lateJoinPolicy" "LateJoinPolicy" NOT NULL DEFAULT 'OPEN',
ALTER COLUMN "extensionSyncPolicy" SET DEFAULT 'DM_AND_PLAYERS';

-- Migration: 20260504113000_add_campaign_poster_url
-- Persist campaign poster image across users by storing data URL on campaign.
ALTER TABLE "Campaign"
ADD COLUMN "posterUrl" TEXT;

-- Migration: 20260506041309_add_password_reset_tokens
-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: 20260509085714_add_post_session_chat_settings
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "postSessionChatDurationMs" INTEGER NOT NULL DEFAULT 300000,
ADD COLUMN     "postSessionChatEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Migration: 20260511054341_add_campaign_dm_auto_target_first_player_join_setting
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "dmAutoTargetOnFirstPlayerJoin" BOOLEAN NOT NULL DEFAULT true;

-- Migration: 20260511234000_add_session_cleanup_state
-- AlterEnum
ALTER TYPE "SessionState" ADD VALUE IF NOT EXISTS 'CLEANUP';

-- Migration: 20260513022137_add_pause_stats_to_session
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "cumulativePauseMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pauseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plannedDurationMinutes" INTEGER;

-- Migration: 20260513022233_add_pause_started_at_to_session
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "pauseStartedAt" TIMESTAMP(3);

-- Migration: 20260516000000_add_session_cooldown_state
-- Add COOLDOWN to the SessionState enum.
-- COOLDOWN is entered when the DM ends the session (ACTIVE/PAUSED → COOLDOWN).
-- The cooldown timer expires and the session auto-transitions to ENDED.
ALTER TYPE "SessionState" ADD VALUE IF NOT EXISTS 'COOLDOWN';

-- Migration: 20260517140315_add_campaign_chat_messages_support
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

-- Migration: 20260520025203_campaign_join_requests_retire_field
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

-- Migration: 20260523000000_campaign_session_duration_and_supported_platforms
-- CreateEnum
CREATE TYPE "SupportedPlatform" AS ENUM ('ANY', 'DDB', 'ROLL20', 'FOUNDRY');

-- AlterTable
ALTER TABLE "Campaign"
  ADD COLUMN "defaultSessionDurationMins" INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN "supportedPlatforms" "SupportedPlatform"[] DEFAULT ARRAY['ANY']::"SupportedPlatform"[];

-- Migration: 20260528000000_add_chat_message_metadata
ALTER TABLE "ChatMessage"
ADD COLUMN "metadata" JSONB;

-- Migration: 20260528132830_add_campaign_deleted_at
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Campaign_deletedAt_idx" ON "Campaign"("deletedAt");

