/*
  Warnings:

  - The primary key for the `MiningSession` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `amountEcho` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `baseRate` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `endedAt` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `multiplier` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `MiningSession` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `MiningSession` table. All the data in the column will be lost.
  - The `id` column on the `MiningSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `emailVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastMineAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `totalMinedEcho` on the `User` table. All the data in the column will be lost.
  - The `id` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `AirdropSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BoostEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NotificationPreference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Wallet` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WalletChallenge` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[walletAddress]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `amountMined` to the `MiningSession` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `userId` on the `MiningSession` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "AirdropSnapshot" DROP CONSTRAINT "AirdropSnapshot_userId_fkey";

-- DropForeignKey
ALTER TABLE "BoostEvent" DROP CONSTRAINT "BoostEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "MiningSession" DROP CONSTRAINT "MiningSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationPreference" DROP CONSTRAINT "NotificationPreference_userId_fkey";

-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- DropForeignKey
ALTER TABLE "WalletChallenge" DROP CONSTRAINT "WalletChallenge_userId_fkey";

-- DropIndex
DROP INDEX "MiningSession_userId_startedAt_idx";

-- AlterTable
ALTER TABLE "MiningSession" DROP CONSTRAINT "MiningSession_pkey",
DROP COLUMN "amountEcho",
DROP COLUMN "baseRate",
DROP COLUMN "endedAt",
DROP COLUMN "multiplier",
DROP COLUMN "source",
DROP COLUMN "startedAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "amountMined" DOUBLE PRECISION NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD CONSTRAINT "MiningSession_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "emailVerified",
DROP COLUMN "lastMineAt",
DROP COLUMN "totalMinedEcho",
ADD COLUMN     "walletAddress" TEXT,
ADD COLUMN     "walletVerified" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "AirdropSnapshot";

-- DropTable
DROP TABLE "BoostEvent";

-- DropTable
DROP TABLE "NotificationPreference";

-- DropTable
DROP TABLE "Wallet";

-- DropTable
DROP TABLE "WalletChallenge";

-- DropEnum
DROP TYPE "MiningSource";

-- CreateTable
CREATE TABLE "WalletNonce" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- AddForeignKey
ALTER TABLE "MiningSession" ADD CONSTRAINT "MiningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
