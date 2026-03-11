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
    lastAccruedAt: Date | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
    endsAt: Date | null;
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
      lastAccruedAt: args.session?.lastAccruedAt
        ? args.session.lastAccruedAt.toISOString()
        : null,
      baseRatePerHr: Number(args.session?.baseRatePerHr ?? 0),
      multiplier: Number(args.session?.multiplier ?? 1),
      sessionMined: Number(args.session?.sessionMined ?? 0),
      endsAt: args.session?.endsAt ? args.session.endsAt.toISOString() : null,
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
    const activeStreak = Number(settled.multiplier ?? 1);
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
      totalMinedEcho: settled.totalMinedEcho,
      totalPurchasedEcho: Number(userTotals?.totalPurchasedEcho ?? 0),
      purchaseMultiplier: Number(userTotals?.purchaseMultiplier ?? 1),
      referralMultiplier: Number(userTotals?.referralMultiplier ?? 1),
    },
    session: {
      isActive: settled.isActive,
      startedAt: settled.startedAt,
      lastAccruedAt: settled.lastAccruedAt,
      baseRatePerHr: settled.baseRatePerHr,
      multiplier: settled.multiplier,
      sessionMined: settled.sessionMined,
      endsAt: settled.endsAt,
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