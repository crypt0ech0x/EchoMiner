// app/api/mining/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { baseRatePerHr?: number; multiplier?: number };

const SESSION_DURATION_SECONDS = 60 * 60 * 24; // ✅ 24 hours
const DEFAULT_BASE_RATE_PER_HR = 1;

export async function POST(req: Request) {
  try {
    const user = await getUserFromSessionCookie();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    if (!user.wallet?.verified) {
      return NextResponse.json({ error: "Wallet not verified" }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid baseRatePerHr" }, { status: 400 });
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return NextResponse.json({ error: "Invalid multiplier" }, { status: 400 });
    }

    const now = new Date();

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

    const endsAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);

    return NextResponse.json({ ok: true, session, endsAt });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ error: "Start failed" }, { status: 500 });
  }
}