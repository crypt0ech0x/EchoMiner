/*
  Warnings:

  - You are about to drop the column `amountMined` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `totalMined` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tag,wallet]` on the table `AirdropSnapshot` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tag` to the `AirdropSnapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MiningSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Wallet` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MiningSource" AS ENUM ('TAP', 'AD_BOOST', 'STORE_BOOST');

-- DropForeignKey
ALTER TABLE "MiningSession" DROP CONSTRAINT "MiningSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- AlterTable
ALTER TABLE "AirdropSnapshot" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "tag" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "eligible" SET DEFAULT true;

-- AlterTable
ALTER TABLE "MiningSession" DROP COLUMN "amountMined",
ADD COLUMN     "amountEcho" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "baseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "source" "MiningSource" NOT NULL DEFAULT 'TAP',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "totalMined",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastMineAt" TIMESTAMP(3),
ADD COLUMN     "totalMinedEcho" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "lastMessage" TEXT,
ADD COLUMN     "lastNonce" TEXT,
ADD COLUMN     "lastSig" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WalletChallenge" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nonce" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "ip" TEXT,
    "ua" TEXT,

    CONSTRAINT "WalletChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "source" "MiningSource" NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "sku" TEXT,
    "usdCents" INTEGER,

    CONSTRAINT "BoostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketingOk" BOOLEAN NOT NULL DEFAULT false,
    "mineAlerts" BOOLEAN NOT NULL DEFAULT true,
    "boostAlerts" BOOLEAN NOT NULL DEFAULT true,
    "airdropAlerts" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletChallenge_nonce_key" ON "WalletChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletChallenge_userId_idx" ON "WalletChallenge"("userId");

-- CreateIndex
CREATE INDEX "WalletChallenge_expiresAt_idx" ON "WalletChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "BoostEvent_userId_startsAt_idx" ON "BoostEvent"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "BoostEvent_endsAt_idx" ON "BoostEvent"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "AirdropSnapshot_tag_idx" ON "AirdropSnapshot"("tag");

-- CreateIndex
CREATE INDEX "AirdropSnapshot_wallet_idx" ON "AirdropSnapshot"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "AirdropSnapshot_tag_wallet_key" ON "AirdropSnapshot"("tag", "wallet");

-- CreateIndex
CREATE INDEX "MiningSession_userId_startedAt_idx" ON "MiningSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletChallenge" ADD CONSTRAINT "WalletChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningSession" ADD CONSTRAINT "MiningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostEvent" ADD CONSTRAINT "BoostEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirdropSnapshot" ADD CONSTRAINT "AirdropSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
