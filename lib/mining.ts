// lib/mining.ts
import { prisma } from "@/lib/prisma";
import { qualifyReferralIfNeeded } from "@/lib/referrals";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24;
export const STREAK_GRACE_SECONDS = 60 * 60 * 24;
export const DEFAULT_BASE_RATE_PER_HR = 1 / 24;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function getSessionEndsAt(startedAt: Date) {
  return new Date(startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);
}

export function getGraceEndsAt(endedAt: Date) {
  return new Date(endedAt.getTime() + STREAK_GRACE_SECONDS * 1000);
}

export function calculateAccrual(args: {
  startedAt: Date;
  lastAccruedAt: Date;
  now: Date;
  baseRatePerHr: number;
  multiplier: number;
}) {
  const endsAt = getSessionEndsAt(args.startedAt);
  const effectiveNow = args.now > endsAt ? endsAt : args.now;

  const deltaSeconds = Math.floor(
    (effectiveNow.getTime() - args.lastAccruedAt.getTime()) / 1000
  );

  const safeDeltaSeconds = clamp(deltaSeconds, 0, SESSION_DURATION_SECONDS);
  const ratePerSec = (args.baseRatePerHr * args.multiplier) / 3600;
  const earned = round6(Math.max(0, safeDeltaSeconds * ratePerSec));
  const shouldEnd = effectiveNow.getTime() >= endsAt.getTime();

  return {
    earned,
    effectiveNow,
    endsAt,
    shouldEnd,
  };
}

export async function getLatestCompletedSession(userId: string) {
  return prisma.miningHistory.findFirst({
    where: { userId },
    orderBy: { endedAt: "desc" },
    select: {
      endedAt: true,
      multiplier: true,
    },
  });
}

export async function getNextSessionPlan(userId: string, now = new Date()) {
  const latest = await getLatestCompletedSession(userId);

  if (!latest) {
    return {
      currentStreak: 0,
      nextMultiplier: 1,
      lastSessionEndAt: null as Date | null,
      graceEndsAt: null as Date | null,
      streakActive: false,
    };
  }

  const graceEndsAt = getGraceEndsAt(latest.endedAt);
  const streakActive = now.getTime() <= graceEndsAt.getTime();
  const currentStreak = streakActive ? Number(latest.multiplier ?? 1) : 0;

  return {
    currentStreak,
    nextMultiplier: streakActive ? currentStreak + 1 : 1,
    lastSessionEndAt: latest.endedAt,
    graceEndsAt,
    streakActive,
  };
}

export async function settleMiningSession(userId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.miningSession.findUnique({
      where: { userId },
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { totalMinedEcho: true },
    });

    if (!session || !session.isActive || !session.startedAt || !session.lastAccruedAt) {
      return {
        isActive: false,
        startedAt: null as Date | null,
        lastAccruedAt: null as Date | null,
        baseRatePerHr: 0,
        multiplier: 1,
        sessionMined: 0,
        totalMinedEcho: user?.totalMinedEcho ?? 0,
        endsAt: null as Date | null,
        earned: 0,
      };
    }

    const { earned, effectiveNow, endsAt, shouldEnd } = calculateAccrual({
      startedAt: session.startedAt,
      lastAccruedAt: session.lastAccruedAt,
      now,
      baseRatePerHr: session.baseRatePerHr,
      multiplier: session.multiplier,
    });

    let updatedSession = session;
    let totalMinedEcho = user?.totalMinedEcho ?? 0;

    if (earned > 0) {
      updatedSession = await tx.miningSession.update({
        where: { userId },
        data: {
          sessionMined: { increment: earned },
          lastAccruedAt: effectiveNow,
          isActive: shouldEnd ? false : true,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          totalMinedEcho: { increment: earned },
        },
        select: { totalMinedEcho: true },
      });

      totalMinedEcho = updatedUser.totalMinedEcho;
    }

    if (shouldEnd) {
      await tx.miningHistory.create({
        data: {
          userId,
          startedAt: session.startedAt,
          endedAt: endsAt,
          baseRatePerHr: session.baseRatePerHr,
          multiplier: session.multiplier,
          totalMined: updatedSession.sessionMined,
        },
      });

      await qualifyReferralIfNeeded(tx, userId);

      await tx.ledgerEntry.create({
        data: {
          userId,
          type: "session_settlement",
          amountEcho: updatedSession.sessionMined,
          sourceType: "miningSession",
          sourceId: session.id,
          metadataJson: {
            startedAt: session.startedAt.toISOString(),
            endedAt: endsAt.toISOString(),
            multiplier: session.multiplier,
            baseRatePerHr: session.baseRatePerHr,
          },
        },
      });

      await tx.miningSession.update({
        where: { userId },
        data: {
          isActive: false,
          startedAt: null,
          lastAccruedAt: null,
          sessionMined: 0,
          baseRatePerHr: 0,
          multiplier: 1,
        },
      });

      return {
        isActive: false,
        startedAt: null as Date | null,
        lastAccruedAt: null as Date | null,
        baseRatePerHr: 0,
        multiplier: 1,
        sessionMined: 0,
        totalMinedEcho,
        endsAt,
        earned,
      };
    }

    return {
      isActive: true,
      startedAt: updatedSession.startedAt,
      lastAccruedAt: updatedSession.lastAccruedAt,
      baseRatePerHr: updatedSession.baseRatePerHr,
      multiplier: updatedSession.multiplier,
      sessionMined: updatedSession.sessionMined,
      totalMinedEcho,
      endsAt,
      earned,
    };
  });
}