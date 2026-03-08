// app/api/admin/snapshot/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleMiningSession, getSessionEndsAt } from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: string | number | boolean | null) {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  try {
    const now = new Date();

    const wallets = await prisma.wallet.findMany({
      select: {
        address: true,
        verified: true,
        verifiedAt: true,
        userId: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = Array.from(new Set(wallets.map((w) => w.userId).filter(Boolean))) as string[];

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
        sessionMined: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const sessionMap = new Map(sessions.map((s) => [s.userId, s]));

    const headers = [
      "wallet",
      "verified",
      "verifiedAt",
      "previousTotal",
      "liveSession",
      "liveTotal",
      "sessionActive",
      "snapshotAt",
    ];

    const rows = wallets.map((wallet) => {
      const user = userMap.get(wallet.userId);
      const session = sessionMap.get(wallet.userId);

      const active =
        !!session?.isActive &&
        !!session?.startedAt &&
        now.getTime() < getSessionEndsAt(session.startedAt).getTime();

      const liveTotal = Number(user?.totalMinedEcho ?? 0);
      const liveSession = active ? Number(session?.sessionMined ?? 0) : 0;
      const previousTotal = Math.max(0, liveTotal - liveSession);

      return [
        wallet.address,
        wallet.verified,
        wallet.verifiedAt ? wallet.verifiedAt.toISOString() : "",
        previousTotal.toFixed(6),
        liveSession.toFixed(6),
        liveTotal.toFixed(6),
        active,
        now.toISOString(),
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((v) => csvEscape(v as any)).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="echominer_snapshot_${now
          .toISOString()
          .slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("admin snapshot error:", err);
    return NextResponse.json({ ok: false, error: "Snapshot failed" }, { status: 500 });
  }
}