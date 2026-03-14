// app/api/admin/analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleMiningSession } from "@/lib/mining";
import { requireAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dayKey(d: Date) {
  return startOfDay(d).toISOString().slice(0, 10);
}

function parseRange(searchParams: URLSearchParams) {
  const raw = Number(searchParams.get("days") ?? 14);
  const days = Number.isFinite(raw)
    ? Math.max(7, Math.min(90, Math.floor(raw)))
    : 14;
  return days;
}

export async function GET(req: Request) {
  try {
    const adminOk = await requireAdminRequest();
    if (!adminOk) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const now = new Date();
    const url = new URL(req.url);
    const days = parseRange(url.searchParams);
    const today = startOfDay(now);
    const rangeStart = addDays(today, -(days - 1));

    const wallets = await prisma.wallet.findMany({
      select: {
        id: true,
        address: true,
        verified: true,
        verifiedAt: true,
        createdAt: true,
        userId: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = Array.from(
      new Set(wallets.map((w) => w.userId).filter(Boolean))
    ) as string[];

    // Settle/refresh all active sessions once so analytics use current live values
    const settledByUserId = new Map<
      string,
      Awaited<ReturnType<typeof settleMiningSession>>
    >();

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

    const histories = await prisma.miningHistory.findMany({
      where: {
        endedAt: {
          gte: rangeStart,
        },
      },
      select: {
        endedAt: true,
        totalMined: true,
      },
      orderBy: { endedAt: "asc" },
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

      const totalMinedEcho = Number(user?.totalMinedEcho ?? 0);
      const totalPurchasedEcho = Number(user?.totalPurchasedEcho ?? 0);
      const purchaseMultiplier = Number(user?.purchaseMultiplier ?? 1);
      const referralMultiplier = Number(user?.referralMultiplier ?? 1);

      const liveSession = active ? Number(settled?.sessionMined ?? 0) : 0;
      const previousTotal = totalMinedEcho;
      const liveTotal = totalMinedEcho + liveSession;

      const endingSoon =
        active &&
        !!settled?.endsAt &&
        settled.endsAt.getTime() - now.getTime() < 60 * 60 * 1000;

      return {
        wallet: wallet.address,
        verified: wallet.verified,
        createdAt: wallet.createdAt.toISOString(),

        previousTotal,
        liveSession,
        liveTotal,

        totalPurchasedEcho,

        sessionActive: active,
        endingSoon,

        baseDailyEcho: active ? Number(settled?.baseDailyEcho ?? 0) : 0,
        currentMultiplier: active ? Number(settled?.currentMultiplier ?? 1) : 1,
        currentRatePerSec: active ? Number(settled?.currentRatePerSec ?? 0) : 0,
        projectedTotalEcho: active ? Number(settled?.projectedTotalEcho ?? 0) : 0,
        earnedEchoSnapshot: active ? Number(settled?.earnedEchoSnapshot ?? 0) : 0,

        purchaseMultiplier,
        referralMultiplier,

        startedAt: settled?.startedAt ? settled.startedAt.toISOString() : null,
        endsAt: settled?.endsAt ? settled.endsAt.toISOString() : null,
        lastRateChangeAt: settled?.lastRateChangeAt
          ? settled.lastRateChangeAt.toISOString()
          : null,

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

    const totalWallets = rows.length;
    const verifiedWallets = rows.filter((r) => r.verified).length;
    const activeSessions = rows.filter((r) => r.sessionActive).length;

    const previousTotal = rows.reduce((s, r) => s + r.previousTotal, 0);
    const liveSessionTotal = rows.reduce((s, r) => s + r.liveSession, 0);
    const liveTotal = rows.reduce((s, r) => s + r.liveTotal, 0);
    const totalPurchasedEcho = rows.reduce((s, r) => s + r.totalPurchasedEcho, 0);

    const newWalletsToday = wallets.filter(
      (w) => new Date(w.createdAt).getTime() >= today.getTime()
    ).length;

    const sessionsEndingSoon = rows.filter((r) => r.endingSoon).length;

    const emissionsMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      emissionsMap.set(dayKey(d), 0);
    }

    for (const h of histories) {
      const key = dayKey(h.endedAt);
      if (emissionsMap.has(key)) {
        emissionsMap.set(key, (emissionsMap.get(key) ?? 0) + Number(h.totalMined ?? 0));
      }
    }

    const todaysLiveEmission = rows.reduce((sum, r) => sum + r.liveSession, 0);
    emissionsMap.set(
      dayKey(today),
      (emissionsMap.get(dayKey(today)) ?? 0) + todaysLiveEmission
    );

    let running = 0;
    const dailyEmissions = Array.from(emissionsMap.entries()).map(
      ([date, emitted]) => {
        running += emitted;
        return {
          date,
          emitted: Number(emitted.toFixed(6)),
          cumulative: Number(running.toFixed(6)),
        };
      }
    );

    const topLive = [...rows].sort((a, b) => b.liveTotal - a.liveTotal).slice(0, 10);
    const topPrevious = [...rows]
      .sort((a, b) => b.previousTotal - a.previousTotal)
      .slice(0, 10);
    const topLiveSession = [...rows]
      .sort((a, b) => b.liveSession - a.liveSession)
      .slice(0, 10);

    return json({
      ok: true,
      generatedAt: now.toISOString(),
      range: {
        days,
        startDate: rangeStart.toISOString(),
        endDate: now.toISOString(),
      },
      summary: {
        totalWallets,
        verifiedWallets,
        activeSessions,
        previousTotal,
        liveSessionTotal,
        liveTotal,
        totalPurchasedEcho,
        avgLivePerWallet: totalWallets > 0 ? liveTotal / totalWallets : 0,
        avgLivePerActive: activeSessions > 0 ? liveTotal / activeSessions : 0,
      },
      activity: {
        newWalletsToday,
        sessionsEndingSoon,
      },
      charts: {
        dailyEmissions,
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