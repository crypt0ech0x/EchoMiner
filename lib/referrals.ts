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

  const code = makeReferralCode(userId);

  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });

  return code;
}

export async function qualifyReferralIfNeeded(tx: any, referredUserId: string) {
  const referral = await tx.referral.findUnique({
    where: { referredUserId },
  });

  if (!referral || referral.status === "qualified") return;

  const priorHistoryCount = await tx.miningHistory.count({
    where: { userId: referredUserId },
  });

  if (priorHistoryCount > 0) return;

  const qualifiedAt = new Date();

  await tx.referral.update({
    where: { referredUserId },
    data: {
      status: "qualified",
      qualifiedAt,
    },
  });

  const qualifiedCount = await tx.referral.count({
    where: {
      referrerUserId: referral.referrerUserId,
      status: "qualified",
    },
  });

  await tx.user.update({
    where: { id: referral.referrerUserId },
    data: {
      referralMultiplier: getReferralMultiplier(qualifiedCount),
    },
  });
}