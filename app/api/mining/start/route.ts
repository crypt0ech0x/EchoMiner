// app/api/mining/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

type Body = { baseRatePerHr?: number; multiplier?: number };

const SESSION_DURATION_SECONDS = 60 * 60 * 24; // 24 hours (match UI)
const DEFAULT_BASE_RATE_PER_HR = 1;

export async function POST(req: Request) {
  try {
    const user = await getUserFromSessionCookie();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    // Always trust DB wallet verification (not client state)
    const wallet = await prisma.wallet.findUnique({
      where: { address: user.wallet?.address ?? "__none__" },
      select: { verified: true, userId: true },
    });

    // If you link wallet to user by userId (recommended), this check is stronger:
    const walletByUser = await prisma.wallet.findFirst({
      where: { userId: user.id },
      select: { verified: true },
    });

    if (!walletByUser?.verified) {
      return NextResponse.json({ ok: false, error: "Wallet not verified" }, { status: 401 });
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const baseRatePerHr =
      body.baseRatePerHr == null ? DEFAULT_BASE_RATE_PER_HR : Number(body.baseRatePerHr);
    const multiplier = body.multiplier == null ? 1 : Number(body.multiplier);

    if (!Number.isFinite(baseRatePerHr) || baseRatePerHr <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid baseRatePerHr" }, { status: 400 });
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid multiplier" }, { status: 400 });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);

    // Start (or restart) the active session
    const session = await prisma.miningSession.upsert({
      where: { userId: user.id },
      update: {
        isActive: true,
        startedAt: now,
        lastAccruedAt: now,
        baseRatePerHr,
        multiplier,
        sessionMined: 0,
      },
      create: {
        userId: user.id,
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
      session,
      endsAt,
      serverTime: now,
    });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ ok: false, error: "Start failed" }, { status: 500 });
  }
}