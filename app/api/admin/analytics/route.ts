// app/api/admin/analytics/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleMiningSession, getSessionEndsAt } from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  try {
    const now = new Date();
    const today = startOfToday();

    const wallets = await prisma.wallet.findMany({
      select: {
        id: true,
        address: true,
        verified: true,
        verifiedAt: true,
        createdAt: true,
        userId: true,
      },
    });

    const userIds = Array.from(
      new Set(wallets.map((w) => w.userId).filter(Boolean))
    ) as string[];

    // settle sessions first
    for (const userId of userIds) {
      await settleMiningSession(userId, now);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        totalMinedEcho: true,
      },
    });

    const sessions = await prisma.miningSession.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        isActive: true,
        startedAt: true,
        lastAccruedAt: true,
        sessionMined: true,
        baseRatePerHr: true,
        multiplier: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const sessionMap = new Map(sessions.map((s) => [s.userId, s]));

    const rows = wallets.map((wallet) => {
      const user = userMap.get(wallet.userId);
      const session = sessionMap.get(wallet.userId);

      const active =
        !!session?.isActive &&
        !!session?.startedAt &&
        now.getTime() < getSessionEndsAt(session.startedAt).getTime();

      const totalMinedEcho = Number(user?.totalMinedEcho ?? 0);
      const liveSession = active ? Number(session?.sessionMined ?? 0) : 0;

      const previousTotal = Math.max(0, totalMinedEcho - liveSession);
      const liveTotal = totalMinedEcho;

      const endingSoon =
        active &&
        session?.startedAt &&
        getSessionEndsAt(session.startedAt).getTime() - now.getTime() <
          60 * 60 * 1000;

      return {
        wallet: wallet.address,
        verified: wallet.verified,
        createdAt: wallet.createdAt.toISOString(),

        previousTotal,
        liveSession,
        liveTotal,

        sessionActive: active,
        endingSoon,
        baseRatePerHr: session?.baseRatePerHr ?? 0,
        multiplier: session?.multiplier ?? 1,

        startedAt: session?.startedAt
          ? session.startedAt.toISOString()
          : null,
      };
    });

    const totalWallets = rows.length;
    const verifiedWallets = rows.filter((r) => r.verified).length;
    const activeSessions = rows.filter((r) => r.sessionActive).length;

    const previousTotal = rows.reduce((s, r) => s + r.previousTotal, 0);
    const liveSessionTotal = rows.reduce((s, r) => s + r.liveSession, 0);
    const liveTotal = rows.reduce((s, r) => s + r.liveTotal, 0);

    const newWalletsToday = wallets.filter(
      (w) => new Date(w.createdAt).getTime() >= today.getTime()
    ).length;

    const sessionsEndingSoon = rows.filter((r) => r.endingSoon).length;

    const topLive = [...rows]
      .sort((a, b) => b.liveTotal - a.liveTotal)
      .slice(0, 10);

    const topPrevious = [...rows]
      .sort((a, b) => b.previousTotal - a.previousTotal)
      .slice(0, 10);

    const topLiveSession = [...rows]
      .sort((a, b) => b.liveSession - a.liveSession)
      .slice(0, 10);

    return json({
      ok: true,
      generatedAt: now.toISOString(),

      summary: {
        totalWallets,
        verifiedWallets,
        activeSessions,

        previousTotal,
        liveSessionTotal,
        liveTotal,

        avgLivePerWallet:
          totalWallets > 0 ? liveTotal / totalWallets : 0,

        avgLivePerActive:
          activeSessions > 0 ? liveTotal / activeSessions : 0,
      },

      activity: {
        newWalletsToday,
        sessionsEndingSoon,
      },

      leaderboards: {
        byLiveTotal: topLive,
        byPreviousTotal: topPrevious,
        byLiveSession: topLiveSession,
      },

      rows,
    });
  } catch (err) {
    console.error("admin analytics error:", err);
    return json({ ok: false, error: "Analytics failed" }, 500);
  }
}