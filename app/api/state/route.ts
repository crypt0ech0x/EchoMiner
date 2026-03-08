// app/api/state/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";
import { settleMiningSession } from "@/lib/mining";

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
  session: {
    isActive: boolean;
    startedAt: Date | null;
    lastAccruedAt: Date | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  } | null;
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
      session: null,
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

  return shapeResponse({
    authed: true,
    wallet,
    totalMinedEcho: settled.totalMinedEcho,
    session: {
      isActive: settled.isActive,
      startedAt: settled.startedAt,
      lastAccruedAt: settled.lastAccruedAt,
      baseRatePerHr: settled.baseRatePerHr,
      multiplier: settled.multiplier,
      sessionMined: settled.sessionMined,
    },
  });
}

export async function GET() {
  return NextResponse.json(await getState());
}

export async function POST() {
  return NextResponse.json(await getState());
}