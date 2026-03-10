// lib/economy.ts

export const PURCHASE_MULTIPLIER_TIERS = [
  { purchasedEcho: 0, multiplier: 1.0 },
  { purchasedEcho: 100, multiplier: 1.1 },
  { purchasedEcho: 250, multiplier: 1.2 },
  { purchasedEcho: 500, multiplier: 1.35 },
  { purchasedEcho: 1000, multiplier: 1.6 },
  { purchasedEcho: 2500, multiplier: 2.0 },
];

export function getPurchaseMultiplier(totalPurchasedEcho: number) {
  let value = 1;
  for (const tier of PURCHASE_MULTIPLIER_TIERS) {
    if (totalPurchasedEcho >= tier.purchasedEcho) {
      value = tier.multiplier;
    }
  }
  return value;
}

export function getReferralMultiplier(qualifiedReferralCount: number) {
  return Math.min(1 + qualifiedReferralCount * 0.05, 2.0);
}

export function getLeaderboardMultiplier(activeReward: { multiplier: number } | null) {
  return activeReward?.multiplier ?? 1;
}

export function getEffectiveMultiplier(args: {
  streakMultiplier: number;
  purchaseMultiplier: number;
  referralMultiplier: number;
  leaderboardMultiplier: number;
  boostMultiplier: number;
}) {
  return (
    args.streakMultiplier *
    args.purchaseMultiplier *
    args.referralMultiplier *
    args.leaderboardMultiplier *
    args.boostMultiplier
  );
}