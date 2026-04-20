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
