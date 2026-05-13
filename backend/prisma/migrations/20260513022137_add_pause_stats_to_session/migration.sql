-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "cumulativePauseMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pauseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plannedDurationMinutes" INTEGER;
