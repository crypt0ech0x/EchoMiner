// app/api/state/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";
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
  totalMinedEcho: number;
  totalPurchasedEcho: number;
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
      verifiedAt: args.wallet?.verifiedAt ? args.wallet.verifiedAt.toISOString() : null,
    },
    user: {
      totalMinedEcho: Number(args.totalMinedEcho ?? 0),
      totalPurchasedEcho: Number(args.totalPurchasedEcho ?? 0),
    },
    session: {
      isActive: args.session?.isActive ?? false,
      startedAt: args.session?.startedAt ? args.session.startedAt.toISOString() : null,
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

async function getState() {
  const authedUser = await getUserFromSessionCookie();

  if (!authedUser) {
    return shapeResponse({
      authed: false,
      wallet: null,
      totalMinedEcho: 0,
      totalPurchasedEcho: 0,
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

  const user = await prisma.user.findUnique({
    where: { id: authedUser.id },
    select: {
      totalPurchasedEcho: true,
    },
  });

  const wallet = await prisma.wallet.findFirst({
    where: { userId: authedUser.id },
    select: {
      address: true,
      verified: true,
      verifiedAt: true,
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
    totalMinedEcho: settled.totalMinedEcho,
    totalPurchasedEcho: Number(user?.totalPurchasedEcho ?? 0),
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

export async function GET() {
  return NextResponse.json(await getState());
}

export async function POST() {
  return NextResponse.json(await getState());
}