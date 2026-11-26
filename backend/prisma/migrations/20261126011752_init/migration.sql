-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('FILE', 'SECRET_NOTE');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('VIEW_META', 'DOWNLOAD_SUCCESS', 'DENIED_PASSWORD', 'DENIED_EXPIRED', 'DENIED_REVOKED', 'DENIED_LIMIT', 'BURNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "publicKeyFingerprint" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "itemType" "ItemType" NOT NULL DEFAULT 'FILE',
    "blobKey" TEXT,
    "encryptedPayload" TEXT,
    "encryptedMetadata" TEXT NOT NULL,
    "metadataIv" TEXT NOT NULL,
    "fileIv" TEXT NOT NULL,
    "sha256Checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientKey" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "wrappedAesKey" TEXT NOT NULL,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "burnAfterReading" BOOLEAN NOT NULL DEFAULT false,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipientKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isPassphraseProtected" BOOLEAN NOT NULL DEFAULT false,
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "burnAfterReading" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "shareLinkId" TEXT,
    "accessorUserId" TEXT,
    "action" "AccessAction" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "VaultItem_ownerId_idx" ON "VaultItem"("ownerId");

-- CreateIndex
CREATE INDEX "VaultItem_expiresAt_idx" ON "VaultItem"("expiresAt");

-- CreateIndex
CREATE INDEX "RecipientKey_recipientId_idx" ON "RecipientKey"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipientKey_itemId_recipientId_key" ON "RecipientKey"("itemId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_itemId_idx" ON "ShareLink"("itemId");

-- CreateIndex
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");

-- CreateIndex
CREATE INDEX "AccessLog_itemId_createdAt_idx" ON "AccessLog"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientKey" ADD CONSTRAINT "RecipientKey_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientKey" ADD CONSTRAINT "RecipientKey_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_accessorUserId_fkey" FOREIGN KEY ("accessorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
