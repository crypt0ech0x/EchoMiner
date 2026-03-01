import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Minimal fields you asked for
    const users = await prisma.user.findMany({
      include: {
        wallet: true,
        purchases: true,
        miningHistory: {
          select: { startedAt: true, endedAt: true },
          orderBy: { startedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const rows = users.map((u) => {
      const first = u.miningHistory[0]?.startedAt ?? null;
      const last = u.miningHistory.length ? u.miningHistory[u.miningHistory.length - 1]?.endedAt : null;

      const totalPurchasedEcho = u.totalPurchasedEcho ?? 0;
      const totalMinedEcho = u.totalMinedEcho ?? 0;

      return {
        userId: u.id,
        walletAddress: u.wallet?.address ?? null,
        walletVerified: !!u.wallet?.verified,
        totalPurchasedEcho,
        totalMinedEcho,
        totalEcho: totalPurchasedEcho + totalMinedEcho,
        firstMiningSession: first,
        mostRecentMiningSession: last,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error("admin/overview error:", err);
    return NextResponse.json({ ok: false, error: "Admin overview failed" }, { status: 500 });
  }
}