// app/api/admin/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleMiningSession, getSessionEndsAt } from "@/lib/mining";

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

    // First settle all users so admin reflects canonical totals
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
      const totalPurchasedEcho = 0;
      const totalEcho = totalMinedEcho + totalPurchasedEcho;

      return {
        wallet: wallet.address,
        verified: wallet.verified,
        verifiedAt: wallet.verifiedAt ? wallet.verifiedAt.toISOString() : null,

        totalPurchasedEcho,
        totalMinedEcho,
        totalEcho,

        sessionActive: active,
        liveSessionMined: active ? Number(session?.sessionMined ?? 0) : 0,
        baseRatePerHr: active ? Number(session?.baseRatePerHr ?? 0) : 0,
        multiplier: active ? Number(session?.multiplier ?? 1) : 1,
        startedAt: active && session?.startedAt ? session.startedAt.toISOString() : null,
        lastAccruedAt:
          active && session?.lastAccruedAt ? session.lastAccruedAt.toISOString() : null,
        endsAt:
          active && session?.startedAt
            ? getSessionEndsAt(session.startedAt).toISOString()
            : null,
      };
    });

    const totals = {
      wallets: rows.length,
      activeSessions: rows.filter((r) => r.sessionActive).length,
      totalMinedEcho: rows.reduce((sum, r) => sum + r.totalMinedEcho, 0),
      totalPurchasedEcho: rows.reduce((sum, r) => sum + r.totalPurchasedEcho, 0),
      totalEcho: rows.reduce((sum, r) => sum + r.totalEcho, 0),
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