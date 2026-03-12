// app/api/mining/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  settleMiningSession,
  getNextSessionPlan,
  DEFAULT_BASE_RATE_PER_HR,
  SESSION_DURATION_SECONDS,
} from "@/lib/mining";
import { getActiveLeaderboardReward } from "@/lib/leaderboard";
import {
  getEffectiveMultiplier,
  getLeaderboardMultiplier,
} from "@/lib/economy";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  walletAddress?: string;
};

async function resolveAuthedUser(req: Request, requestedWalletAddress?: string | null) {
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

export async function GET(req: Request) {
  try {
    const sessionUser = await getUserFromRequest(req);

    if (!sessionUser) {
      return NextResponse.json(
        {
          ok: false,
          method: "GET",
          error: "Unauthorized",
          serverWalletAddress: null,
        },
        { status: 401 }
      );
    }

    const wallet = await prisma.wallet.findFirst({
      where: { userId: sessionUser.id },
      select: { address: true },
    });

    const session = await prisma.miningSession.findUnique({
      where: { userId: sessionUser.id },
    });

    return NextResponse.json({
      ok: true,
      method: "GET",
      authedUserId: sessionUser.id,
      serverWalletAddress: wallet?.address ?? null,
      session,
      note: "Use POST to actually start a mining session.",
    });
  } catch (err) {
    console.error("mining/start GET error:", err);
    return NextResponse.json({ ok: false, error: "Debug failed" }, { status: 500 });
  }
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

    if (settled.isActive && settled.startedAt) {
      const endsAt = new Date(
        settled.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Session already active",
          endsAt: endsAt.toISOString(),
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
    const streakPlan = await getNextSessionPlan(userId, now);

    const userMultipliers = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        purchaseMultiplier: true,
        referralMultiplier: true,
      },
    });

    const activeReward = await getActiveLeaderboardReward(userId, now);

    const streakMultiplier = streakPlan.nextMultiplier;
    const purchaseMultiplier = Number(userMultipliers?.purchaseMultiplier ?? 1);
    const referralMultiplier = Number(userMultipliers?.referralMultiplier ?? 1);
    const leaderboardMultiplier = getLeaderboardMultiplier(activeReward);
    const boostMultiplier = 1;

    const multiplier = getEffectiveMultiplier({
      streakMultiplier,
      purchaseMultiplier,
      referralMultiplier,
      leaderboardMultiplier,
      boostMultiplier,
    });

    const baseRatePerHr = DEFAULT_BASE_RATE_PER_HR;

    await prisma.miningSession.upsert({
      where: { userId },
      update: {
        isActive: true,
        startedAt: now,
        lastAccruedAt: now,
        baseRatePerHr,
        multiplier,
        sessionMined: 0,
      },
      create: {
        userId,
        isActive: true,
        startedAt: now,
        lastAccruedAt: now,
        baseRatePerHr,
        multiplier,
        sessionMined: 0,
      },
    });

    return NextResponse.json({
      ok: true,
      endsAt: endsAt.toISOString(),
      baseRatePerHr,
      multiplier,
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
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ ok: false, error: "Start failed" }, { status: 500 });
  }
}