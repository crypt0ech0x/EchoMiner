// app/api/mining/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMatchingWalletSession,
  isWalletSessionErr,
} from "@/lib/server-wallet-auth";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  walletAddress?: string;
};

export async function GET(req: Request) {
  try {
    const sessionCheck = await requireMatchingWalletSession(req, null);

    if (isWalletSessionErr(sessionCheck)) {
      return NextResponse.json(
        {
          ok: false,
          method: "GET",
          error: sessionCheck.error,
          serverWalletAddress: sessionCheck.serverWalletAddress ?? null,
        },
        { status: sessionCheck.status }
      );
    }

    const session = await prisma.miningSession.findUnique({
      where: { userId: sessionCheck.user.id },
    });

    return NextResponse.json({
      ok: true,
      method: "GET",
      authedUserId: sessionCheck.user.id,
      serverWalletAddress: sessionCheck.walletAddress,
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

    const sessionCheck = await requireMatchingWalletSession(
      req,
      requestedWalletAddress
    );

    if (isWalletSessionErr(sessionCheck)) {
      return NextResponse.json(
        {
          ok: false,
          error: sessionCheck.error,
          serverWalletAddress: sessionCheck.serverWalletAddress ?? null,
          requestedWalletAddress: sessionCheck.requestedWalletAddress ?? null,
        },
        { status: sessionCheck.status }
      );
    }

    const authedUser = sessionCheck.user;

    const settled = await settleMiningSession(authedUser.id);

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
    const streakPlan = await getNextSessionPlan(authedUser.id, now);

    const userMultipliers = await prisma.user.findUnique({
      where: { id: authedUser.id },
      select: {
        purchaseMultiplier: true,
        referralMultiplier: true,
      },
    });

    const activeReward = await getActiveLeaderboardReward(authedUser.id, now);

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
      where: { userId: authedUser.id },
      update: {
        isActive: true,
        startedAt: now,
        lastAccruedAt: now,
        baseRatePerHr,
        multiplier,
        sessionMined: 0,
      },
      create: {
        userId: authedUser.id,
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
    });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ ok: false, error: "Start failed" }, { status: 500 });
  }
}