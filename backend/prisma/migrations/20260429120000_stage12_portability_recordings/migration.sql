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
