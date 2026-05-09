-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "postSessionChatDurationMs" INTEGER NOT NULL DEFAULT 300000,
ADD COLUMN     "postSessionChatEnabled" BOOLEAN NOT NULL DEFAULT true;
