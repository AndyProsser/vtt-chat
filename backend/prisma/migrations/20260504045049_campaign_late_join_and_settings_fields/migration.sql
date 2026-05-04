-- CreateEnum
CREATE TYPE "LateJoinPolicy" AS ENUM ('OPEN', 'SCREENED', 'BLOCKED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "lateJoinGraceMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "lateJoinPolicy" "LateJoinPolicy" NOT NULL DEFAULT 'OPEN',
ALTER COLUMN "extensionSyncPolicy" SET DEFAULT 'DM_AND_PLAYERS';
