import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  settleMiningSession,
  getNextSessionPlan,
  startProjectedMiningSession,
  DEFAULT_BASE_DAILY_ECHO,
  SESSION_DURATION_SECONDS,
} from "@/lib/mining";
import { getEffectiveMultiplier } from "@/lib/economy";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  walletAddress?: string;
};

async function resolveAuthedUser(
  req: Request,
  requestedWalletAddress?: string | null
) {
  const sessionUser = await getUserFromRequest(req);

  if (sessionUser) {
    const wallet = await prisma.wallet.findFirst({
      where: { userId: sessionUser.id },
      select: {
        address: true,
        verified: true,
        verifiedAt: true,
      },
    });

    if (wallet?.address && wallet.verified) {
      if (
        requestedWalletAddress &&
        requestedWalletAddress.trim() &&
        requestedWalletAddress !== wallet.address
      ) {
        return {
          ok: false as const,
          status: 409,
          error: "Wallet session mismatch",
          serverWalletAddress: wallet.address,
          requestedWalletAddress,
        };
      }

      return {
        ok: true as const,
        userId: sessionUser.id,
        walletAddress: wallet.address,
      };
    }
  }

  if (!requestedWalletAddress || !requestedWalletAddress.trim()) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
      serverWalletAddress: null,
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  const wallet = await prisma.wallet.findUnique({
    where: { address: requestedWalletAddress },
    select: {
      userId: true,
      address: true,
      verified: true,
    },
  });

  if (!wallet?.userId || !wallet.verified) {
    return {
      ok: false as const,
      status: 401,
      error: "Wallet not verified",
      serverWalletAddress: wallet?.address ?? null,
      requestedWalletAddress,
    };
  }

  return {
    ok: true as const,
    userId: wallet.userId,
    walletAddress: wallet.address,
  };
}

export async function POST(req: Request) {
  try {
    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const requestedWalletAddress = (body.walletAddress ?? "").trim();
    const auth = await resolveAuthedUser(req, requestedWalletAddress);

    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: auth.error,
          serverWalletAddress: auth.serverWalletAddress ?? null,
          requestedWalletAddress: auth.requestedWalletAddress ?? null,
        },
        { status: auth.status }
      );
    }

    const userId = auth.userId;
    const settled = await settleMiningSession(userId);

    if (settled.isActive && settled.startedAt && settled.endsAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "Session already active",
          endsAt: settled.endsAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const streakPlan = await getNextSessionPlan(userId, now);

    const userMultipliers = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        purchaseMultiplier: true,
        referralMultiplier: true,
      },
    });

    const streakMultiplier = Number(streakPlan.nextMultiplier ?? 1);
    const purchaseMultiplier = Number(userMultipliers?.purchaseMultiplier ?? 1);
    const referralMultiplier = Number(userMultipliers?.referralMultiplier ?? 1);
    const leaderboardMultiplier = 1;
    const boostMultiplier = 1;

    const baseSessionMultiplier = getEffectiveMultiplier({
      streakMultiplier,
      purchaseMultiplier,
      referralMultiplier,
      leaderboardMultiplier,
      boostMultiplier,
    });

    const startedSession = await startProjectedMiningSession({
      userId,
      baseSessionMultiplier,
      now,
      baseDailyEcho: DEFAULT_BASE_DAILY_ECHO,
    });

    const endsAt =
      startedSession.endsAt ??
      new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);

    return NextResponse.json({
      ok: true,
      startedAt: startedSession.startedAt?.toISOString() ?? now.toISOString(),
      endsAt: endsAt.toISOString(),
      baseDailyEcho: Number(startedSession.baseDailyEcho ?? DEFAULT_BASE_DAILY_ECHO),
      baseSessionMultiplier: Number(startedSession.baseSessionMultiplier ?? baseSessionMultiplier),
      boostMultiplier: Number(startedSession.boostMultiplier ?? 1),
      boostExpiresAt: startedSession.boostExpiresAt
        ? startedSession.boostExpiresAt.toISOString()
        : null,
      currentMultiplier: Number(startedSession.currentMultiplier ?? baseSessionMultiplier),
      currentRatePerSec: Number(startedSession.currentRatePerSec ?? 0),
      projectedTotalEcho: Number(startedSession.projectedTotalEcho ?? 0),
      earnedEchoSnapshot: Number(startedSession.earnedEchoSnapshot ?? 0),
      lastRateChangeAt:
        startedSession.lastRateChangeAt?.toISOString() ?? now.toISOString(),
      sessionMined: Number(startedSession.sessionMined ?? 0),
      multiplierBreakdown: {
        streakMultiplier,
        purchaseMultiplier,
        referralMultiplier,
        leaderboardMultiplier,
        boostMultiplier,
      },
      streak: {
        currentStreak: streakPlan.nextMultiplier,
        graceEndsAt: streakPlan.graceEndsAt
          ? streakPlan.graceEndsAt.toISOString()
          : null,
      },
      walletAddress: auth.walletAddress,
    });
  } catch (err: any) {
    console.error("mining/start error full:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Start failed",
      },
      { status: 500 }
    );
  }
}