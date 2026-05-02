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
