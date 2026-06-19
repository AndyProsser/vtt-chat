-- CreateEnum
CREATE TYPE "SessionScheduleType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY_NTH');

-- AlterTable
ALTER TABLE "Campaign"
  ADD COLUMN "sessionScheduleType"    "SessionScheduleType",
  ADD COLUMN "sessionScheduleDay"     INTEGER,
  ADD COLUMN "sessionScheduleNth"     INTEGER,
  ADD COLUMN "sessionScheduleHour"    INTEGER,
  ADD COLUMN "sessionScheduleMinute"  INTEGER,
  ADD COLUMN "sessionScheduleTz"      TEXT,
  ADD COLUMN "nextSessionDate"        TIMESTAMP(3),
  ADD COLUMN "nextSessionIsManual"    BOOLEAN NOT NULL DEFAULT false;
