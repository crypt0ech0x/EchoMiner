import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_DURATION_SECONDS = 60 * 60 * 3;
const MIN_REFRESH_INTERVAL_SECONDS = 2;

function json(data: any, init?: number) {
  return NextResponse.json(data, init ? { status: init } : undefined);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function handler() {
  const authedUser = await getUserFromSessionCookie();
  if (!authedUser) return json({ ok: false, error: "Not logged in" }, 401);

  const wallet = await prisma.wallet.findFirst({
    where: { userId: authedUser.id },
    select: { address: true, verified: true, verifiedAt: true },
  });
  if (!wallet?.verified) return json({ ok: false, error: "Wallet not verified" }, 401);

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
        wallet,
        user: { totalMinedEcho: user?.totalMinedEcho ?? 0 },
        session: session ?? null,
        earned: 0,
        endsAt: null as Date | null,
      };
    }

    // Rate limit refresh
    const secondsSinceLast = Math.floor((now.getTime() - session.lastAccruedAt.getTime()) / 1000);
    const endsAt = new Date(session.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);

    if (secondsSinceLast < MIN_REFRESH_INTERVAL_SECONDS) {
      return {
        ok: true,
        wallet,
        user: { totalMinedEcho: user?.totalMinedEcho ?? 0 },
        session,
        earned: 0,
        endsAt,
      };
    }

    const effectiveNow = now > endsAt ? endsAt : now;

    const deltaSeconds = Math.floor((effectiveNow.getTime() - session.lastAccruedAt.getTime()) / 1000);
    const safeDeltaSeconds = clamp(deltaSeconds, 0, SESSION_DURATION_SECONDS);

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
      wallet,
      user: { totalMinedEcho: updatedUser.totalMinedEcho },
      session: shouldEnd ? { ...updatedSession, isActive: false, sessionMined: 0 } : updatedSession,
      earned,
      endsAt,
    };
  });

  return json(payload);
}

// Browser visit = GET
export async function GET() {
  return json({
    ok: true,
    info: "Use POST to refresh mining accrual. (GET is for testing.)",
  });
}

export async function POST() {
  try {
    return await handler();
  } catch (err) {
    console.error("mining/refresh error:", err);
    return json({ ok: false, error: "Refresh failed" }, 500);
  }
}