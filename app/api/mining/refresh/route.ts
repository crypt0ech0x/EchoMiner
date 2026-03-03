// app/api/mining/refresh/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_DURATION_SECONDS = 60 * 60 * 24; // 24h
const MIN_REFRESH_INTERVAL_MS = 1500; // server-side anti-spam

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function shapeResponse(user: any) {
  return {
    ok: true,
    authed: !!user,
    wallet: {
      address: user?.wallet?.address ?? null,
      verified: user?.wallet?.verified ?? false,
      verifiedAt: user?.wallet?.verifiedAt ? user.wallet.verifiedAt.toISOString() : null,
    },
    user: {
      totalMinedEcho: user?.totalMinedEcho ?? 0,
    },
    session: {
      isActive: user?.miningSession?.isActive ?? false,
      startedAt: user?.miningSession?.startedAt ? user.miningSession.startedAt.toISOString() : null,
      lastAccruedAt: user?.miningSession?.lastAccruedAt ? user.miningSession.lastAccruedAt.toISOString() : null,
      baseRatePerHr: user?.miningSession?.baseRatePerHr ?? 0,
      multiplier: user?.miningSession?.multiplier ?? 1,
      sessionMined: user?.miningSession?.sessionMined ?? 0,
    },
  };
}

export async function POST() {
  try {
    const authedUser = await getUserFromSessionCookie();
    if (!authedUser) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    // verify wallet from DB (do NOT trust cookie user.wallet)
    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: { verified: true },
    });
    if (!wallet?.verified) {
      return NextResponse.json({ ok: false, error: "Wallet not verified" }, { status: 401 });
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const session = await tx.miningSession.findUnique({
        where: { userId: authedUser.id },
      });

      // nothing to accrue
      if (!session || !session.isActive || !session.startedAt || !session.lastAccruedAt) return;

      const endsAt = new Date(session.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);
      const effectiveNow = now > endsAt ? endsAt : now;

      const msSinceLast = effectiveNow.getTime() - session.lastAccruedAt.getTime();
      if (msSinceLast < MIN_REFRESH_INTERVAL_MS) return;

      const deltaSecondsRaw = msSinceLast / 1000;
      const safeDeltaSeconds = clamp(deltaSecondsRaw, 0, SESSION_DURATION_SECONDS);

      const ratePerSec = (session.baseRatePerHr * session.multiplier) / 3600;
      const earned = round6(Math.max(0, safeDeltaSeconds * ratePerSec));

      const shouldEnd = effectiveNow.getTime() >= endsAt.getTime();

      const updatedSession = await tx.miningSession.update({
        where: { userId: authedUser.id },
        data: {
          sessionMined: { increment: earned },
          lastAccruedAt: effectiveNow,
          isActive: shouldEnd ? false : true,
        },
      });

      await tx.user.update({
        where: { id: authedUser.id },
        data: { totalMinedEcho: { increment: earned } },
      });

      if (shouldEnd) {
        await tx.miningHistory.create({
          data: {
            userId: authedUser.id,
            startedAt: session.startedAt,
            endedAt: endsAt,
            baseRatePerHr: session.baseRatePerHr,
            multiplier: session.multiplier,
            totalMined: updatedSession.sessionMined,
          },
        });

        await tx.miningSession.update({
          where: { userId: authedUser.id },
          data: {
            isActive: false,
            startedAt: null,
            lastAccruedAt: null,
            sessionMined: 0,
            baseRatePerHr: 0,
            multiplier: 1,
          },
        });
      }
    });

    // After accrual, return the SAME shape as /api/state
    const freshUser = await prisma.user.findUnique({
      where: { id: authedUser.id },
      include: { wallet: true, miningSession: true },
    });

    return NextResponse.json(shapeResponse(freshUser));
  } catch (err) {
    console.error("mining/refresh error:", err);
    return NextResponse.json({ ok: false, error: "Refresh failed" }, { status: 500 });
  }
}