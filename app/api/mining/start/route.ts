// app/api/mining/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMatchingWalletSession,
  isWalletSessionErr,
} from "@/lib/server-wallet-auth";
import { settleMiningSession } from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  baseRatePerHr?: number;
  multiplier?: number;
  walletAddress?: string;
};

const SESSION_DURATION_SECONDS = 60 * 60 * 24; // 24 hours
const DEFAULT_BASE_RATE_PER_HR = 1;

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

    const baseRatePerHr =
      body.baseRatePerHr == null ? DEFAULT_BASE_RATE_PER_HR : Number(body.baseRatePerHr);

    const multiplier = body.multiplier == null ? 1 : Number(body.multiplier);

    if (!Number.isFinite(baseRatePerHr) || baseRatePerHr <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid baseRatePerHr" }, { status: 400 });
    }

    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid multiplier" }, { status: 400 });
    }

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
    });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ ok: false, error: "Start failed" }, { status: 500 });
  }
}