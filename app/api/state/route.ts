import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs"; // important for Prisma on Vercel

export async function POST() {
  try {
    const user = await getUserFromSessionCookie();

    if (!user) {
      return NextResponse.json({
        ok: true,
        authed: false,
        wallet: { address: null, verified: false, verifiedAt: null },
        user: { totalMinedEcho: 0 },
        session: {
          isActive: false,
          startedAt: null,
          lastAccruedAt: null,
          baseRatePerHr: 0,
          multiplier: 1,
          sessionMined: 0,
        },
      });
    }

    const session = await prisma.miningSession.findUnique({ where: { userId: user.id } });

    return NextResponse.json({
      ok: true,
      authed: true,
      wallet: {
        address: user.wallet?.address ?? null,
        verified: user.wallet?.verified ?? false,
        verifiedAt: user.wallet?.verifiedAt ? user.wallet.verifiedAt.toISOString() : null,
      },
      user: {
        totalMinedEcho: user.totalMinedEcho ?? 0,
      },
      session: {
        isActive: session?.isActive ?? false,
        startedAt: session?.startedAt ? session.startedAt.toISOString() : null,
        lastAccruedAt: session?.lastAccruedAt ? session.lastAccruedAt.toISOString() : null,
        baseRatePerHr: session?.baseRatePerHr ?? 0,
        multiplier: session?.multiplier ?? 1,
        sessionMined: session?.sessionMined ?? 0,
      },
    });
  } catch (e) {
    console.error("api/state error:", e);
    return NextResponse.json({ ok: false, error: "State failed" }, { status: 500 });
  }
}

// Optional but helpful: lets you visit /api/state in a browser without 405
export async function GET() {
  return POST();
}