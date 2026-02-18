import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

type Body = { baseRatePerHr: number; multiplier?: number };

const SESSION_DURATION_SECONDS = 60 * 60 * 3;

function isFinitePositive(n: number) {
  return Number.isFinite(n) && n > 0;
}

export async function POST(req: Request) {
  try {
    const authedUser = await getUserFromSessionCookie();
    if (!authedUser) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // Always re-check verified wallet from DB (don’t rely on included relation)
    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: { verified: true, address: true },
    });
    if (!wallet?.verified) {
      return NextResponse.json({ error: "Wallet not verified" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const baseRatePerHr = Number(body?.baseRatePerHr);
    const multiplier = body?.multiplier == null ? 1 : Number(body.multiplier);

    if (!isFinitePositive(baseRatePerHr)) {
      return NextResponse.json({ error: "Invalid baseRatePerHr" }, { status: 400 });
    }
    if (!isFinitePositive(multiplier)) {
      return NextResponse.json({ error: "Invalid multiplier" }, { status: 400 });
    }
    if (multiplier > 10) {
      return NextResponse.json({ error: "Multiplier too high" }, { status: 400 });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);

    // If you want: do not allow restart while active
    const existing = await prisma.miningSession.findUnique({
      where: { userId: authedUser.id },
      select: { isActive: true, startedAt: true },
    });

    if (existing?.isActive && existing.startedAt) {
      const existingEndsAt = new Date(existing.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);
      // already active — return current timing rather than resetting
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        endsAt: existingEndsAt,
      });
    }

    const session = await prisma.miningSession.upsert({
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
      alreadyActive: false,
      endsAt,
      session: {
        isActive: session.isActive,
        startedAt: session.startedAt,
        lastAccruedAt: session.lastAccruedAt,
        baseRatePerHr: session.baseRatePerHr,
        multiplier: session.multiplier,
        sessionMined: session.sessionMined,
      },
    });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ error: "Start failed" }, { status: 500 });
  }
}
