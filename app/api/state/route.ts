// app/api/state/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  settleMiningSession,
  getNextSessionPlan,
  getGraceEndsAt,
} from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shapeResponse(args: {
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: Date | null;
  } | null;
  user: {
    totalMinedEcho: number;
    totalPurchasedEcho: number;
    purchaseMultiplier: number;
    referralMultiplier: number;
  };
  session: {
    isActive: boolean;
    startedAt: Date | null;
    endsAt: Date | null;
    baseDailyEcho: number;
    currentMultiplier: number;
    currentRatePerSec: number;
    earnedEchoSnapshot: number;
    lastRateChangeAt: Date | null;
    projectedTotalEcho: number;
    sessionMined: number;
  } | null;
  streak: {
    currentStreak: number;
    nextMultiplier: number;
    lastSessionEndAt: Date | null;
    graceEndsAt: Date | null;
  };
}) {
  return {
    ok: true,
    authed: args.authed,
    wallet: {
      address: args.wallet?.address ?? null,
      verified: args.wallet?.verified ?? false,
      verifiedAt: args.wallet?.verifiedAt
        ? args.wallet.verifiedAt.toISOString()
        : null,
    },
    user: {
      totalMinedEcho: Number(args.user.totalMinedEcho ?? 0),
      totalPurchasedEcho: Number(args.user.totalPurchasedEcho ?? 0),
      purchaseMultiplier: Number(args.user.purchaseMultiplier ?? 1),
      referralMultiplier: Number(args.user.referralMultiplier ?? 1),
    },
    session: {
      isActive: args.session?.isActive ?? false,
      startedAt: args.session?.startedAt
        ? args.session.startedAt.toISOString()
        : null,
      endsAt: args.session?.endsAt ? args.session.endsAt.toISOString() : null,
      baseDailyEcho: Number(args.session?.baseDailyEcho ?? 0),
      currentMultiplier: Number(args.session?.currentMultiplier ?? 1),
      currentRatePerSec: Number(args.session?.currentRatePerSec ?? 0),
      earnedEchoSnapshot: Number(args.session?.earnedEchoSnapshot ?? 0),
      lastRateChangeAt: args.session?.lastRateChangeAt
        ? args.session.lastRateChangeAt.toISOString()
        : null,
      projectedTotalEcho: Number(args.session?.projectedTotalEcho ?? 0),
      sessionMined: Number(args.session?.sessionMined ?? 0),
    },
    streak: {
      currentStreak: Number(args.streak.currentStreak ?? 0),
      nextMultiplier: Number(args.streak.nextMultiplier ?? 1),
      lastSessionEndAt: args.streak.lastSessionEndAt
        ? args.streak.lastSessionEndAt.toISOString()
        : null,
      graceEndsAt: args.streak.graceEndsAt
        ? args.streak.graceEndsAt.toISOString()
        : null,
    },
  };
}

async function getState(req: Request) {
  const authedUser = await getUserFromRequest(req);

  if (!authedUser) {
    return shapeResponse({
      authed: false,
      wallet: null,
      user: {
        totalMinedEcho: 0,
        totalPurchasedEcho: 0,
        purchaseMultiplier: 1,
        referralMultiplier: 1,
      },
      session: null,
      streak: {
        currentStreak: 0,
        nextMultiplier: 1,
        lastSessionEndAt: null,
        graceEndsAt: null,
      },
    });
  }

  const settled = await settleMiningSession(authedUser.id);

  const wallet = await prisma.wallet.findFirst({
    where: { userId: authedUser.id },
    select: {
      address: true,
      verified: true,
      verifiedAt: true,
    },
  });

  const userTotals = await prisma.user.findUnique({
    where: { id: authedUser.id },
    select: {
      totalPurchasedEcho: true,
      purchaseMultiplier: true,
      referralMultiplier: true,
    },
  });

  let streak;
  if (settled.isActive) {
    const activeStreak = Number(settled.currentMultiplier ?? 1);
    streak = {
      currentStreak: activeStreak,
      nextMultiplier: activeStreak + 1,
      lastSessionEndAt: settled.endsAt,
      graceEndsAt: settled.endsAt ? getGraceEndsAt(settled.endsAt) : null,
    };
  } else {
    const plan = await getNextSessionPlan(authedUser.id);
    streak = {
      currentStreak: Number(plan.currentStreak ?? 0),
      nextMultiplier: Number(plan.nextMultiplier ?? 1),
      lastSessionEndAt: plan.lastSessionEndAt,
      graceEndsAt: plan.graceEndsAt,
    };
  }

  return shapeResponse({
    authed: true,
    wallet,
    user: {
      totalMinedEcho: Number(settled.totalMinedEcho ?? 0),
      totalPurchasedEcho: Number(userTotals?.totalPurchasedEcho ?? 0),
      purchaseMultiplier: Number(userTotals?.purchaseMultiplier ?? 1),
      referralMultiplier: Number(userTotals?.referralMultiplier ?? 1),
    },
    session: {
      isActive: settled.isActive,
      startedAt: settled.startedAt,
      endsAt: settled.endsAt,
      baseDailyEcho: Number(settled.baseDailyEcho ?? 0),
      currentMultiplier: Number(settled.currentMultiplier ?? 1),
      currentRatePerSec: Number(settled.currentRatePerSec ?? 0),
      earnedEchoSnapshot: Number(settled.earnedEchoSnapshot ?? 0),
      lastRateChangeAt: settled.lastRateChangeAt,
      projectedTotalEcho: Number(settled.projectedTotalEcho ?? 0),
      sessionMined: Number(settled.sessionMined ?? 0),
    },
    streak,
  });
}

export async function GET(req: Request) {
  return NextResponse.json(await getState(req));
}

export async function POST(req: Request) {
  return NextResponse.json(await getState(req));
}