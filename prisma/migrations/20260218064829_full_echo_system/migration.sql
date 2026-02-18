/*
  Warnings:

  - The primary key for the `MiningSession` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `amountMined` on the `MiningSession` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `walletAddress` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `walletVerified` on the `User` table. All the data in the column will be lost.
  - The primary key for the `WalletNonce` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[userId]` on the table `MiningSession` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `MiningSession` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MiningSession" DROP CONSTRAINT "MiningSession_userId_fkey";

-- DropIndex
DROP INDEX "User_walletAddress_key";

-- AlterTable
ALTER TABLE "MiningSession" DROP CONSTRAINT "MiningSession_pkey",
DROP COLUMN "amountMined",
ADD COLUMN     "baseRatePerHr" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAccruedAt" TIMESTAMP(3),
ADD COLUMN     "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "sessionMined" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "userId" SET DATA TYPE TEXT,
ADD CONSTRAINT "MiningSession_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "MiningSession_id_seq";

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "walletAddress",
DROP COLUMN "walletVerified",
ADD COLUMN     "totalMinedEcho" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "User_id_seq";

-- AlterTable
ALTER TABLE "WalletNonce" DROP CONSTRAINT "WalletNonce_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "WalletNonce_id_seq";

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "userId" TEXT,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "baseRatePerHr" DOUBLE PRECISION NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "totalMined" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MiningHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "MiningHistory_userId_idx" ON "MiningHistory"("userId");

-- CreateIndex
CREATE INDEX "MiningHistory_createdAt_idx" ON "MiningHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiningSession_userId_key" ON "MiningSession"("userId");

-- CreateIndex
CREATE INDEX "MiningSession_isActive_idx" ON "MiningSession"("isActive");

-- CreateIndex
CREATE INDEX "User_totalMinedEcho_idx" ON "User"("totalMinedEcho");

-- CreateIndex
CREATE INDEX "WalletNonce_walletAddress_idx" ON "WalletNonce"("walletAddress");

-- CreateIndex
CREATE INDEX "WalletNonce_nonce_idx" ON "WalletNonce"("nonce");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningSession" ADD CONSTRAINT "MiningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningHistory" ADD CONSTRAINT "MiningHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
