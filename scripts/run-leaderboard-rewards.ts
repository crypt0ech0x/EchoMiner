// scripts/run-leaderboard-rewards.ts
import { prisma } from "@/lib/prisma";
import { getLeaderboardRewardForRank } from "@/lib/leaderboard";

async function main() {
  const now = new Date();

  const startsAt = new Date(now);
  startsAt.setHours(0, 0, 0, 0);

  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  const periodKey = startsAt.toISOString().slice(0, 10);

  const topUsers = await prisma.user.findMany({
    orderBy: { totalMinedEcho: "desc" },
    take: 10,
    select: { id: true },
  });

  // Clear any previously generated rewards for this exact window
  await prisma.leaderboardReward.deleteMany({
    where: {
      startsAt,
      endsAt,
    },
  });

  for (let i = 0; i < topUsers.length; i++) {
    const rank = i + 1;
    const multiplier = getLeaderboardRewardForRank(rank);

    if (multiplier <= 1) continue;

    const reward = await prisma.leaderboardReward.create({
      data: {
        userId: topUsers[i].id,
        rank,
        multiplier,
        startsAt,
        endsAt,
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        userId: topUsers[i].id,
        type: "leaderboard_reward",
        amountEcho: 0,
        sourceType: "leaderboard",
        sourceId: reward.id,
        metadataJson: {
          rank,
          multiplier,
          periodKey,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      },
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });