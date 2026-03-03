// app/api/mining/refresh/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_DURATION_SECONDS = 60 * 60 * 24; // 24h
const MIN_REFRESH_INTERVAL_MS = 1500; // 1.5s (server-side anti-spam)

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Avoid float drift by rounding to 6 decimals
function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export async function POST() {
  try {
    const authedUser = await getUserFromSessionCookie();
    if (!authedUser) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: { verified: true },
    });
    if (!wallet?.verified) {
      return NextResponse.json({ ok: false, error: "Wallet not verified" }, { status: 401 });
    }

    const now = new Date();

    const payload = await prisma.$transaction(async (tx) => {
      const session = await tx.miningSession.findUnique({
        where: { userId: authedUser.id },
      });

      const user = await tx.user.findUnique({
        where: { id: authedUser.id },
        select: { totalMinedEcho: true },
      });

      // No active session
      if (!session || !session.isActive || !session.startedAt || !session.lastAccruedAt) {
        return {
          ok: true,
          isActive: false,
          earned: 0,
          sessionMined: session?.sessionMined ?? 0,
          totalMinedEcho: user?.totalMinedEcho ?? 0,
          endsAt: null as Date | null,
        };
      }

      const endsAt = new Date(session.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);

      // If already past end, clamp effective time to endsAt
      const effectiveNow = now > endsAt ? endsAt : now;

      // Anti-spam: if calls are too frequent, do nothing (but keep isActive correct)
      const msSinceLast = effectiveNow.getTime() - session.lastAccruedAt.getTime();
      if (msSinceLast < MIN_REFRESH_INTERVAL_MS) {
        return {
          ok: true,
          isActive: effectiveNow.getTime() < endsAt.getTime(),
          earned: 0,
          sessionMined: session.sessionMined,
          totalMinedEcho: user?.totalMinedEcho ?? 0,
          endsAt,
        };
      }

      // Fractional seconds (no floor!)
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

      const updatedUser = await tx.user.update({
        where: { id: authedUser.id },
        data: { totalMinedEcho: { increment: earned } },
        select: { totalMinedEcho: true },
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

      return {
        ok: true,
        isActive: !shouldEnd,
        earned,
        sessionMined: shouldEnd ? 0 : updatedSession.sessionMined,
        totalMinedEcho: updatedUser.totalMinedEcho,
        endsAt,
      };
    });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("mining/refresh error:", err);
    return NextResponse.json({ ok: false, error: "Refresh failed" }, { status: 500 });
  }
}