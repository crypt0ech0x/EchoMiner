// app/api/state/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

// Build a full AppState that matches lib/types.ts so the UI never crashes
function buildAppStateFromDb(user: any) {
  const authed = !!user;

  const walletAddress = user?.wallet?.address ?? null;
  const walletVerifiedAt = user?.wallet?.verifiedAt
    ? new Date(user.wallet.verifiedAt).getTime()
    : null;

  const totalMined = user?.totalMinedEcho ?? 0;

  // Map DB miningSession -> UI MiningSession
  const isActive = user?.miningSession?.isActive ?? false;
  const startedAt = user?.miningSession?.startedAt ? new Date(user.miningSession.startedAt).getTime() : null;

  // Your UI session model expects startTime/endTime/effectiveRate/etc.
  const baseRatePerHr = user?.miningSession?.baseRatePerHr ?? 0;
  const multiplier = user?.miningSession?.multiplier ?? 1;

  const effectiveRatePerHr = baseRatePerHr * multiplier;

  return {
    user: {
      id: user?.id ?? "guest",
      username: user?.username ?? "Guest",
      balance: 0,
      totalMined: totalMined,
      referrals: 0,
      joinedDate: user?.createdAt ? new Date(user.createdAt).getTime() : Date.now(),
      guest: !authed,
      riskScore: 0,
      referralCode: user?.referralCode ?? "GUEST",
      isAdmin: false,
      priorityAirdrop: false,
      pfpUrl: user?.pfpUrl ?? undefined,
      email: user?.email ?? undefined,
      emailVerified: !!user?.emailVerified,
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
    },

    streak: {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    session: {
      id: user?.miningSession?.id ?? "session",
      isActive,
      startTime: startedAt,
      endTime: null,
      baseRate: baseRatePerHr,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: effectiveRatePerHr / 3600, // UI seems to treat effectiveRate as “per second” in your math
      status: isActive ? "active" : "ended",
    },

    activeBoosts: [],
    ledger: [],
    purchaseHistory: [],
    notifications: [],

    walletAddress,
    walletVerifiedAt,
    currentNonce: null,
  };
}

async function getStateInternal() {
  const authedUser = await getUserFromSessionCookie();
  if (!authedUser) return buildAppStateFromDb(null);

  const user = await prisma.user.findUnique({
    where: { id: authedUser.id },
    include: { wallet: true, miningSession: true },
  });

  return buildAppStateFromDb(user);
}

export async function GET() {
  const state = await getStateInternal();
  return NextResponse.json(state);
}

export async function POST() {
  // Keep POST so old clients don’t 405
  const state = await getStateInternal();
  return NextResponse.json(state);
}