// lib/referrals.ts
import { prisma } from "@/lib/prisma";
import { getReferralMultiplier } from "@/lib/economy";

export function makeReferralCode(userId: string) {
  return `ECHO${userId.slice(-8).toUpperCase()}`;
}

export async function ensureReferralCode(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (user?.referralCode) return user.referralCode;

  let code = makeReferralCode(userId);

  // Very small collision guard in case a generated code already exists
  const existing = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });

  if (existing && existing.id !== userId) {
    code = `${code}${userId.slice(-2).toUpperCase()}`;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });

  return code;
}

/**
 * Called when a referred user completes their first qualifying mining session.
 *
 * Current schema:
 * - referred user stores `referredByUserId`
 * - referrer keeps aggregate fields like:
 *   - totalReferralEcho
 *   - referralMultiplier
 *
 * There is no separate Referral table anymore.
 */
export async function qualifyReferralIfNeeded(tx: any, referredUserId: string) {
  const referredUser = await tx.user.findUnique({
    where: { id: referredUserId },
    select: {
      id: true,
      referredByUserId: true,
    },
  });

  if (!referredUser?.referredByUserId) return;

  // Count completed sessions for the referred user.
  // This function is called after a MiningHistory row is created at settlement,
  // so a count of 1 means they just completed their first qualifying session.
  const completedSessionCount = await tx.miningHistory.count({
    where: { userId: referredUserId },
  });

  if (completedSessionCount !== 1) return;

  const referrerUserId = referredUser.referredByUserId;

  // Count all qualified referrals for the referrer:
  // users who point at this referrer and have completed at least one session.
  const referredUsers = await tx.user.findMany({
    where: {
      referredByUserId: referrerUserId,
    },
    select: {
      id: true,
    },
  });

  const referredIds = referredUsers.map((u: { id: string }) => u.id);

  let qualifiedCount = 0;

  if (referredIds.length > 0) {
    const qualifiedUserIds = await tx.miningHistory.findMany({
      where: {
        userId: { in: referredIds },
      },
      select: {
        userId: true,
      },
      distinct: ["userId"],
    });

    qualifiedCount = qualifiedUserIds.length;
  }

  await tx.user.update({
    where: { id: referrerUserId },
    data: {
      referralMultiplier: getReferralMultiplier(qualifiedCount),
    },
  });
}