-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccessAction" ADD VALUE 'CREATED';
ALTER TYPE "AccessAction" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "AccessLog" ADD COLUMN     "ipHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VaultItem" ADD COLUMN     "burned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isBurnAfterReading" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPasswordProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDownloads" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'MODE_B',
ADD COLUMN     "ownerToken" TEXT,
ADD COLUMN     "recipientUsername" TEXT,
ADD COLUMN     "remainingDownloads" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "wrappedAesKeyB64" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
