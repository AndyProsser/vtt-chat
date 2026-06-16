-- CreateTable
CREATE TABLE "DeviceCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCredential_credentialHash_key" ON "DeviceCredential"("credentialHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCredential_userId_deviceId_key" ON "DeviceCredential"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "DeviceCredential_userId_idx" ON "DeviceCredential"("userId");

-- CreateIndex
CREATE INDEX "DeviceCredential_expiresAt_idx" ON "DeviceCredential"("expiresAt");

-- AddForeignKey
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
