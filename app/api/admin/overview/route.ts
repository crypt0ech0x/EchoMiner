// app/api/admin/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleMiningSession } from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  try {
    const wallets = await prisma.wallet.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        address: true,
        verified: true,
        verifiedAt: true,
        userId: true,
      },
    });

    const now = new Date();

    const userIds = Array.from(
      new Set(wallets.map((w) => w.userId).filter(Boolean))
    ) as string[];

    const settledByUserId = new Map<
      string,
      Awaited<ReturnType<typeof settleMiningSession>>
    >();

    // Refresh all sessions first so overview uses canonical live values
    for (const userId of userIds) {
      const settled = await settleMiningSession(userId, now);
      settledByUserId.set(userId, settled);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        totalMinedEcho: true,
        totalPurchasedEcho: true,
        purchaseMultiplier: true,
        referralMultiplier: true,
      },
    });

    const sessions = await prisma.miningSession.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        isActive: true,
        startedAt: true,
        endsAt: true,
        sessionMined: true,
        baseDailyEcho: true,
        currentMultiplier: true,
        currentRatePerSec: true,
        lastRateChangeAt: true,
        projectedTotalEcho: true,
        earnedEchoSnapshot: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const sessionMap = new Map(sessions.map((s) => [s.userId, s]));

    const rows = wallets.map((wallet) => {
      const user = wallet.userId ? userMap.get(wallet.userId) : undefined;
      const session = wallet.userId ? sessionMap.get(wallet.userId) : undefined;
      const settled = wallet.userId ? settledByUserId.get(wallet.userId) : undefined;

      const active =
        !!settled?.isActive &&
        !!settled?.startedAt &&
        !!settled?.endsAt &&
        now.getTime() < settled.endsAt.getTime();

      const settledTotal = Number(user?.totalMinedEcho ?? 0);
      const liveSessionMined = active ? Number(settled?.sessionMined ?? 0) : 0;

      // In the projected model, user.totalMinedEcho is settled only.
      const previousTotal = settledTotal;
      const liveTotal = settledTotal + liveSessionMined;

      return {
        wallet: wallet.address,
        verified: wallet.verified,
        verifiedAt: wallet.verifiedAt ? wallet.verifiedAt.toISOString() : null,

        previousTotal,
        liveTotal,

        totalPurchasedEcho: Number(user?.totalPurchasedEcho ?? 0),
        purchaseMultiplier: Number(user?.purchaseMultiplier ?? 1),
        referralMultiplier: Number(user?.referralMultiplier ?? 1),

        sessionActive: active,
        liveSessionMined,

        baseDailyEcho: active ? Number(settled?.baseDailyEcho ?? 0) : 0,
        currentMultiplier: active ? Number(settled?.currentMultiplier ?? 1) : 1,
        currentRatePerSec: active ? Number(settled?.currentRatePerSec ?? 0) : 0,
        projectedTotalEcho: active ? Number(settled?.projectedTotalEcho ?? 0) : 0,
        earnedEchoSnapshot: active ? Number(settled?.earnedEchoSnapshot ?? 0) : 0,

        startedAt:
          active && settled?.startedAt ? settled.startedAt.toISOString() : null,
        lastRateChangeAt:
          active && settled?.lastRateChangeAt
            ? settled.lastRateChangeAt.toISOString()
            : null,
        endsAt: active && settled?.endsAt ? settled.endsAt.toISOString() : null,

        rawSession: session
          ? {
              isActive: session.isActive,
              startedAt: session.startedAt?.toISOString() ?? null,
              endsAt: session.endsAt?.toISOString() ?? null,
              sessionMined: Number(session.sessionMined ?? 0),
              baseDailyEcho: Number(session.baseDailyEcho ?? 0),
              currentMultiplier: Number(session.currentMultiplier ?? 1),
              currentRatePerSec: Number(session.currentRatePerSec ?? 0),
              lastRateChangeAt: session.lastRateChangeAt?.toISOString() ?? null,
              projectedTotalEcho: Number(session.projectedTotalEcho ?? 0),
              earnedEchoSnapshot: Number(session.earnedEchoSnapshot ?? 0),
            }
          : null,
      };
    });

    const totals = {
      wallets: rows.length,
      activeSessions: rows.filter((r) => r.sessionActive).length,
      previousTotal: rows.reduce((sum, r) => sum + r.previousTotal, 0),
      liveSessionTotal: rows.reduce((sum, r) => sum + r.liveSessionMined, 0),
      liveTotal: rows.reduce((sum, r) => sum + r.liveTotal, 0),
      totalPurchasedEcho: rows.reduce((sum, r) => sum + r.totalPurchasedEcho, 0),
    };

    return json({
      ok: true,
      rows,
      totals,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}