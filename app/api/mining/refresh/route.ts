// app/api/mining/refresh/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { settleMiningSession } from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const authedUser = await getUserFromRequest(req);

    if (!authedUser) {
      return NextResponse.json(
        { ok: false, error: "Not logged in" },
        { status: 401 }
      );
    }

    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: {
        address: true,
        verified: true,
        verifiedAt: true,
      },
    });

    if (!wallet?.verified) {
      return NextResponse.json(
        { ok: false, error: "Wallet not verified" },
        { status: 401 }
      );
    }

    const settled = await settleMiningSession(authedUser.id);

    return NextResponse.json({
      ok: true,
      authed: true,
      wallet: {
        address: wallet.address ?? null,
        verified: true,
        verifiedAt: wallet.verifiedAt
          ? wallet.verifiedAt.toISOString()
          : null,
      },
      user: {
        totalMinedEcho: Number(settled.totalMinedEcho ?? 0),
      },
      session: {
        isActive: settled.isActive,
        startedAt: settled.startedAt ? settled.startedAt.toISOString() : null,
        endsAt: settled.endsAt ? settled.endsAt.toISOString() : null,
        baseDailyEcho: Number(settled.baseDailyEcho ?? 0),
        currentMultiplier: Number(settled.currentMultiplier ?? 1),
        currentRatePerSec: Number(settled.currentRatePerSec ?? 0),
        earnedEchoSnapshot: Number(settled.earnedEchoSnapshot ?? 0),
        lastRateChangeAt: settled.lastRateChangeAt
          ? settled.lastRateChangeAt.toISOString()
          : null,
        projectedTotalEcho: Number(settled.projectedTotalEcho ?? 0),
        sessionMined: Number(settled.sessionMined ?? 0),
      },
      earned: Number(settled.earned ?? 0),
    });
  } catch (err: any) {
    console.error("mining/refresh error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Refresh failed" },
      { status: 500 }
    );
  }
}