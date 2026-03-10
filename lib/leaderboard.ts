// lib/leaderboard.ts
import { prisma } from "@/lib/prisma";

export function getLeaderboardRewardForRank(rank: number) {
  if (rank === 1) return 2.0;
  if (rank >= 2 && rank <= 5) return 1.5;
  if (rank >= 6 && rank <= 10) return 1.2;
  return 1.0;
}

export async function getActiveLeaderboardReward(userId: string, now = new Date()) {
  return prisma.leaderboardReward.findFirst({
    where: {
      userId,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { multiplier: "desc" },
  });
}