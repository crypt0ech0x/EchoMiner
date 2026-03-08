// app/api/mining/refresh/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";
import { settleMiningSession } from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const authedUser = await getUserFromSessionCookie();

    if (!authedUser) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: { verified: true },
    });

    if (!wallet?.verified) {
      return NextResponse.json({ ok: false, error: "Wallet not verified" }, { status: 401 });
    }

    const settled = await settleMiningSession(authedUser.id);

    return NextResponse.json({
      ok: true,
      authed: true,
      wallet: {
        address: authedUser.wallet?.address ?? null,
        verified: true,
        verifiedAt: authedUser.wallet?.verifiedAt
          ? authedUser.wallet.verifiedAt.toISOString()
          : null,
      },
      user: {
        totalMinedEcho: settled.totalMinedEcho,
      },
      session: {
        isActive: settled.isActive,
        startedAt: settled.startedAt ? settled.startedAt.toISOString() : null,
        lastAccruedAt: settled.lastAccruedAt ? settled.lastAccruedAt.toISOString() : null,
        baseRatePerHr: settled.baseRatePerHr,
        multiplier: settled.multiplier,
        sessionMined: settled.sessionMined,
      },
      earned: settled.earned,
      endsAt: settled.endsAt ? settled.endsAt.toISOString() : null,
    });
  } catch (err) {
    console.error("mining/refresh error:", err);
    return NextResponse.json({ ok: false, error: "Refresh failed" }, { status: 500 });
  }
}