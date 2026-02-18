import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

const SESSION_DURATION_SECONDS = 60 * 60 * 3;
const MIN_REFRESH_INTERVAL_SECONDS = 2;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Avoid float drift by rounding to 6 decimals (adjust as you like)
function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export async function POST() {
  try {
    const authedUser = await getUserFromSessionCookie();
    if (!authedUser) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    // Always re-check verified wallet from DB
    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: { verified: true },
    });
    if (!wallet?.verified) {
      return NextResponse.json({ error: "Wallet not verified" }, { status: 401 });
    }

    const now = new Date();

    const payload = await prisma.$transaction(async (tx) => {
      const session = await tx.miningSession.findUnique({
        where: { userId: authedUser.id },
      });

      // No active session
      if (!session || !session.isActive || !session.startedAt || !session.lastAccruedAt) {
        const user = await tx.user.findUnique({
          where: { id: authedUser.id },
          select: { totalMinedEcho: true },
        });

        return {
          ok: true,
          isActive: false,
          earned: 0,
          sessionMined: session?.sessionMined ?? 0,
          totalMinedEcho: user?.totalMinedEcho ?? 0,
          endsAt: null as Date | null,
        };
      }

      // Rate limit refresh
      const secondsSinceLast = Math.floor((now.getTime() - session.lastAccruedAt.getTime()) / 1000);
      if (secondsSinceLast < MIN_REFRESH_INTERVAL_SECONDS) {
        const user = await tx.user.findUnique({
          where: { id: authedUser.id },
          select: { totalMinedEcho: true },
        });

        const endsAt = new Date(session.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);

        return {
          ok: true,
          isActive: true,
          earned: 0,
          sessionMined: session.sessionMined,
          totalMinedEcho: user?.totalMinedEcho ?? 0,
          endsAt,
        };
      }

      const endsAt = new Date(session.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);
      const effectiveNow = now > endsAt ? endsAt : now;

      const deltaSeconds = Math.floor((effectiveNow.getTime() - session.lastAccruedAt.getTime()) / 1000);
      const safeDeltaSeconds = clamp(deltaSeconds, 0, SESSION_DURATION_SECONDS);

      const ratePerSec = (session.baseRatePerHr * session.multiplier) / 3600;
      const earnedRaw = safeDeltaSeconds * ratePerSec;
      const earned = round6(Math.max(0, earnedRaw));

      const shouldEnd = effectiveNow.getTime() >= endsAt.getTime();

      // Apply increments
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

      // If ended, write history and reset active session row
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
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
