// lib/mining.ts
import { prisma } from "@/lib/prisma";
import { qualifyReferralIfNeeded } from "@/lib/referrals";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24;
export const STREAK_GRACE_SECONDS = 60 * 60 * 24;
export const DEFAULT_BASE_DAILY_ECHO = 1.0;

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

export function getBaseRatePerSec(baseDailyEcho: number) {
  return baseDailyEcho / SESSION_DURATION_SECONDS;
}

export function getBaseRatePerHr(baseDailyEcho: number) {
  return baseDailyEcho / 24;
}

export function getRatePerSec(args: {
  baseDailyEcho: number;
  multiplier: number;
}) {
  return getBaseRatePerSec(args.baseDailyEcho) * args.multiplier;
}

export function getRatePerHr(args: {
  baseDailyEcho: number;
  multiplier: number;
}) {
  return getBaseRatePerHr(args.baseDailyEcho) * args.multiplier;
}

export function getLiveEarnedEcho(args: {
  earnedEchoSnapshot: number;
  currentRatePerSec: number;
  lastRateChangeAt: Date | null;
  now: Date;
  endsAt: Date | null;
  projectedTotalEcho: number;
}) {
  if (!args.lastRateChangeAt || !args.endsAt) {
    return round6(args.earnedEchoSnapshot);
  }

  const effectiveNow = args.now > args.endsAt ? args.endsAt : args.now;
  const deltaSeconds = Math.max(
    0,
    Math.floor((effectiveNow.getTime() - args.lastRateChangeAt.getTime()) / 1000)
  );

  const live =
    Number(args.earnedEchoSnapshot ?? 0) +
    deltaSeconds * Number(args.currentRatePerSec ?? 0);

  return round6(
    Math.min(Number(args.projectedTotalEcho ?? 0), Math.max(0, live))
  );
}

export function getProjectedTotalEcho(args: {
  earnedSoFar: number;
  now: Date;
  endsAt: Date;
  baseDailyEcho: number;
  multiplier: number;
}) {
  const remainingSeconds = Math.max(
    0,
    Math.floor((args.endsAt.getTime() - args.now.getTime()) / 1000)
  );

  const newRatePerSec = getRatePerSec({
    baseDailyEcho: args.baseDailyEcho,
    multiplier: args.multiplier,
  });

  return round6(args.earnedSoFar + remainingSeconds * newRatePerSec);
}

export function buildNewSessionValues(args: {
  now: Date;
  baseDailyEcho: number;
  multiplier: number;
}) {
  const startedAt = args.now;
  const endsAt = getSessionEndsAt(startedAt);

  const currentRatePerSec = getRatePerSec({
    baseDailyEcho: args.baseDailyEcho,
    multiplier: args.multiplier,
  });

  const projectedTotalEcho = round6(
    currentRatePerSec * SESSION_DURATION_SECONDS
  );

  return {
    startedAt,
    endsAt,
    baseDailyEcho: args.baseDailyEcho,
    currentMultiplier: args.multiplier,
    currentRatePerSec,
    earnedEchoSnapshot: 0,
    lastRateChangeAt: startedAt,
    projectedTotalEcho,
    sessionMined: 0,
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

  const currentStreak = streakActive
    ? clamp(Number(latest.multiplier ?? 1), 1, 1000)
    : 0;

  return {
    currentStreak,
    nextMultiplier: streakActive ? currentStreak + 1 : 1,
    lastSessionEndAt: latest.endedAt,
    graceEndsAt,
    streakActive,
  };
}

export async function startProjectedMiningSession(args: {
  userId: string;
  multiplier: number;
  now?: Date;
  baseDailyEcho?: number;
}) {
  const now = args.now ?? new Date();
  const baseDailyEcho = args.baseDailyEcho ?? DEFAULT_BASE_DAILY_ECHO;

  const sessionValues = buildNewSessionValues({
    now,
    baseDailyEcho,
    multiplier: args.multiplier,
  });

  return prisma.miningSession.upsert({
    where: { userId: args.userId },
    update: {
      isActive: true,
      startedAt: sessionValues.startedAt,
      endsAt: sessionValues.endsAt,
      baseDailyEcho: sessionValues.baseDailyEcho,
      currentMultiplier: sessionValues.currentMultiplier,
      currentRatePerSec: sessionValues.currentRatePerSec,
      earnedEchoSnapshot: 0,
      lastRateChangeAt: sessionValues.lastRateChangeAt,
      projectedTotalEcho: sessionValues.projectedTotalEcho,
      sessionMined: 0,
    },
    create: {
      userId: args.userId,
      isActive: true,
      startedAt: sessionValues.startedAt,
      endsAt: sessionValues.endsAt,
      baseDailyEcho: sessionValues.baseDailyEcho,
      currentMultiplier: sessionValues.currentMultiplier,
      currentRatePerSec: sessionValues.currentRatePerSec,
      earnedEchoSnapshot: 0,
      lastRateChangeAt: sessionValues.lastRateChangeAt,
      projectedTotalEcho: sessionValues.projectedTotalEcho,
      sessionMined: 0,
    },
  });
}

export async function reprojectMiningSession(args: {
  userId: string;
  newMultiplier: number;
  now?: Date;
}) {
  const now = args.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const session = await tx.miningSession.findUnique({
      where: { userId: args.userId },
    });

    if (!session || !session.isActive || !session.startedAt || !session.endsAt) {
      return null;
    }

    const earnedSoFar = getLiveEarnedEcho({
      earnedEchoSnapshot: session.earnedEchoSnapshot,
      currentRatePerSec: session.currentRatePerSec,
      lastRateChangeAt: session.lastRateChangeAt,
      now,
      endsAt: session.endsAt,
      projectedTotalEcho: session.projectedTotalEcho,
    });

    const effectiveNow = now > session.endsAt ? session.endsAt : now;

    const newRatePerSec = getRatePerSec({
      baseDailyEcho: session.baseDailyEcho,
      multiplier: args.newMultiplier,
    });

    const newProjectedTotalEcho = getProjectedTotalEcho({
      earnedSoFar,
      now: effectiveNow,
      endsAt: session.endsAt,
      baseDailyEcho: session.baseDailyEcho,
      multiplier: args.newMultiplier,
    });

    const updated = await tx.miningSession.update({
      where: { userId: args.userId },
      data: {
        currentMultiplier: args.newMultiplier,
        currentRatePerSec: newRatePerSec,
        earnedEchoSnapshot: earnedSoFar,
        lastRateChangeAt: effectiveNow,
        projectedTotalEcho: newProjectedTotalEcho,
        sessionMined: earnedSoFar,
      },
    });

    return {
      ...updated,
      liveEarnedEcho: earnedSoFar,
    };
  });
}

export async function getLiveMiningSnapshot(userId: string, now = new Date()) {
  const session = await prisma.miningSession.findUnique({
    where: { userId },
  });

  if (!session || !session.isActive || !session.startedAt || !session.endsAt) {
    return {
      isActive: false,
      startedAt: null as Date | null,
      endsAt: null as Date | null,
      baseDailyEcho: 0,
      currentMultiplier: 1,
      currentRatePerSec: 0,
      earnedEchoSnapshot: 0,
      lastRateChangeAt: null as Date | null,
      projectedTotalEcho: 0,
      sessionMined: 0,
      liveEarnedEcho: 0,
      earned: 0,
    };
  }

  const liveEarnedEcho = getLiveEarnedEcho({
    earnedEchoSnapshot: session.earnedEchoSnapshot,
    currentRatePerSec: session.currentRatePerSec,
    lastRateChangeAt: session.lastRateChangeAt,
    now,
    endsAt: session.endsAt,
    projectedTotalEcho: session.projectedTotalEcho,
  });

  return {
    isActive: true,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    baseDailyEcho: session.baseDailyEcho,
    currentMultiplier: session.currentMultiplier,
    currentRatePerSec: session.currentRatePerSec,
    earnedEchoSnapshot: session.earnedEchoSnapshot,
    lastRateChangeAt: session.lastRateChangeAt,
    projectedTotalEcho: session.projectedTotalEcho,
    sessionMined: liveEarnedEcho,
    liveEarnedEcho,
    earned: liveEarnedEcho,
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

    if (!session || !session.isActive || !session.startedAt || !session.endsAt) {
      return {
        isActive: false,
        startedAt: null as Date | null,
        endsAt: null as Date | null,
        baseDailyEcho: 0,
        currentMultiplier: 1,
        currentRatePerSec: 0,
        earnedEchoSnapshot: 0,
        lastRateChangeAt: null as Date | null,
        projectedTotalEcho: 0,
        sessionMined: 0,
        totalMinedEcho: user?.totalMinedEcho ?? 0,
        earned: 0,
      };
    }

    const earned = getLiveEarnedEcho({
      earnedEchoSnapshot: session.earnedEchoSnapshot,
      currentRatePerSec: session.currentRatePerSec,
      lastRateChangeAt: session.lastRateChangeAt,
      now,
      endsAt: session.endsAt,
      projectedTotalEcho: session.projectedTotalEcho,
    });

    const shouldEnd = now.getTime() >= session.endsAt.getTime();

    if (!shouldEnd) {
      const updated = await tx.miningSession.update({
        where: { userId },
        data: {
          sessionMined: earned,
        },
      });

      return {
        isActive: true,
        startedAt: updated.startedAt,
        endsAt: updated.endsAt,
        baseDailyEcho: updated.baseDailyEcho,
        currentMultiplier: updated.currentMultiplier,
        currentRatePerSec: updated.currentRatePerSec,
        earnedEchoSnapshot: updated.earnedEchoSnapshot,
        lastRateChangeAt: updated.lastRateChangeAt,
        projectedTotalEcho: updated.projectedTotalEcho,
        sessionMined: earned,
        totalMinedEcho: user?.totalMinedEcho ?? 0,
        earned,
      };
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        totalMinedEcho: {
          increment: earned,
        },
      },
      select: { totalMinedEcho: true },
    });

    await tx.miningHistory.create({
      data: {
        userId,
        startedAt: session.startedAt,
        endedAt: session.endsAt,
        baseRatePerHr: round6(getBaseRatePerHr(session.baseDailyEcho)),
        multiplier: session.currentMultiplier,
        totalMined: earned,
      },
    });

    await qualifyReferralIfNeeded(tx, userId);

    await tx.ledgerEntry.create({
      data: {
        userId,
        type: "session_settlement",
        amountEcho: earned,
        sourceType: "miningSession",
        sourceId: session.id,
        metadataJson: {
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endsAt.toISOString(),
          currentMultiplier: session.currentMultiplier,
          baseDailyEcho: session.baseDailyEcho,
          currentRatePerSec: session.currentRatePerSec,
          projectedTotalEcho: session.projectedTotalEcho,
        },
      },
    });

    await tx.miningSession.update({
      where: { userId },
      data: {
        isActive: false,
        startedAt: null,
        endsAt: null,
        baseDailyEcho: 0,
        currentMultiplier: 1,
        currentRatePerSec: 0,
        earnedEchoSnapshot: 0,
        lastRateChangeAt: null,
        projectedTotalEcho: 0,
        sessionMined: 0,
      },
    });

    return {
      isActive: false,
      startedAt: null as Date | null,
      endsAt: null as Date | null,
      baseDailyEcho: 0,
      currentMultiplier: 1,
      currentRatePerSec: 0,
      earnedEchoSnapshot: 0,
      lastRateChangeAt: null as Date | null,
      projectedTotalEcho: 0,
      sessionMined: 0,
      totalMinedEcho: updatedUser.totalMinedEcho,
      earned,
    };
  });
}