import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUserFromSessionCookie();

    if (!user) {
      return NextResponse.json({
        authed: false,
        wallet: null,
        user: null,
        session: null,
      });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    });

    const session = await prisma.miningSession.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      authed: true,

      user: {
        id: user.id,
        totalMined: user.totalMinedEcho ?? 0,
      },

      wallet: wallet
        ? {
            address: wallet.address,
            verified: wallet.verified,
            verifiedAt: wallet.verifiedAt,
          }
        : null,

      session: session
        ? {
            isActive: session.isActive,
            startedAt: session.startedAt,
            lastAccruedAt: session.lastAccruedAt,
            sessionMined: session.sessionMined,
            baseRate: session.baseRatePerHr,
            multiplier: session.multiplier,
            effectiveRate:
              (session.baseRatePerHr * session.multiplier) / 3600,
          }
        : null,
    });
  } catch (err) {
    console.error("state error:", err);

    return NextResponse.json(
      {
        authed: false,
        wallet: null,
        user: null,
        session: null,
      },
      { status: 500 }
    );
  }
}