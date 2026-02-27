// app/api/state/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

function shapeResponse(user: any) {
  return {
    ok: true,
    authed: !!user,
    wallet: {
      address: user?.wallet?.address ?? null,
      verified: user?.wallet?.verified ?? false,
      verifiedAt: user?.wallet?.verifiedAt ?? null,
    },
    user: {
      totalMinedEcho: user?.totalMinedEcho ?? 0,
    },
    session: {
      isActive: user?.miningSession?.isActive ?? false,
      startedAt: user?.miningSession?.startedAt ?? null,
      lastAccruedAt: user?.miningSession?.lastAccruedAt ?? null,
      baseRatePerHr: user?.miningSession?.baseRatePerHr ?? 0,
      multiplier: user?.miningSession?.multiplier ?? 1,
      sessionMined: user?.miningSession?.sessionMined ?? 0,
    },
  };
}

async function getState() {
  const authedUser = await getUserFromSessionCookie();
  if (!authedUser) return shapeResponse(null);

  const user = await prisma.user.findUnique({
    where: { id: authedUser.id },
    include: { wallet: true, miningSession: true },
  });

  return shapeResponse(user);
}

export async function GET() {
  const data = await getState();
  return NextResponse.json(data);
}

export async function POST() {
  const data = await getState();
  return NextResponse.json(data);
}