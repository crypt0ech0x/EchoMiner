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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  walletAddress?: string;
};

export async function GET() {
  try {
    const sessionCheck = await requireMatchingWalletSession(null);

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
    const sessionCheck = await requireMatchingWalletSession(requestedWalletAddress);

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

    const baseRatePerHr = DEFAULT_BASE_RATE_PER_HR;
    const multiplier = streakPlan.nextMultiplier;

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
      streak: {
        currentStreak: multiplier,
        graceEndsAt: streakPlan.graceEndsAt ? streakPlan.graceEndsAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ ok: false, error: "Start failed" }, { status: 500 });
  }
}