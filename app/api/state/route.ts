import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getUserFromSessionCookie();

    // Not logged in yet → return a safe default shape
    if (!user) {
      return NextResponse.json({
        ok: true,
        authed: false,
        wallet: {
          address: null as string | null,
          verified: false,
          verifiedAt: null as string | null,
        },
        user: {
          totalMinedEcho: 0,
        },
        session: {
          isActive: false,
          startedAt: null as string | null,
          lastAccruedAt: null as string | null,
          baseRatePerHr: 0,
          multiplier: 1,
          sessionMined: 0,
        },
      });
    }

    // Pull fresh truth from DB
    const [dbUser, wallet, miningSession] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, totalMinedEcho: true, email: true },
      }),
      prisma.wallet.findFirst({
        where: { userId: user.id },
        select: { address: true, verified: true, verifiedAt: true },
      }),
      prisma.miningSession.findUnique({
        where: { userId: user.id },
        select: {
          isActive: true,
          startedAt: true,
          lastAccruedAt: true,
          baseRatePerHr: true,
          multiplier: true,
          sessionMined: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      authed: true,
      user: {
        id: dbUser?.id ?? user.id,
        email: dbUser?.email ?? null,
        totalMinedEcho: dbUser?.totalMinedEcho ?? 0,
      },
      wallet: {
        address: wallet?.address ?? null,
        verified: wallet?.verified ?? false,
        verifiedAt: wallet?.verifiedAt ? wallet.verifiedAt.toISOString() : null,
      },
      session: {
        isActive: miningSession?.isActive ?? false,
        startedAt: miningSession?.startedAt ? miningSession.startedAt.toISOString() : null,
        lastAccruedAt: miningSession?.lastAccruedAt ? miningSession.lastAccruedAt.toISOString() : null,
        baseRatePerHr: miningSession?.baseRatePerHr ?? 0,
        multiplier: miningSession?.multiplier ?? 1,
        sessionMined: miningSession?.sessionMined ?? 0,
      },
    });
  } catch (err) {
    console.error("state GET error:", err);
    return NextResponse.json({ ok: false, error: "State fetch failed" }, { status: 500 });
  }
}
