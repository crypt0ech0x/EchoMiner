import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: {
        wallet: true,
        miningHistory: {
          orderBy: { createdAt: "asc" }, // so first/last are easy
        },
      },
      take: 200, // safety
    });

    const rows = users.map((u) => {
      const first = u.miningHistory[0]?.startedAt ?? null;
      const last = u.miningHistory.length
        ? u.miningHistory[u.miningHistory.length - 1]?.startedAt ?? null
        : null;

      const totalMinedEcho = Number(u.totalMinedEcho ?? 0);

      // purchases redacted for now
      const totalPurchasedEcho = 0;

      return {
        walletAddress: u.wallet?.address ?? null,
        totalMinedEcho,
        totalPurchasedEcho,
        totalEcho: totalMinedEcho + totalPurchasedEcho,
        firstMineAt: first ? first.toISOString() : null,
        lastMineAt: last ? last.toISOString() : null,
      };
    });

    return json({ ok: true, rows });
  } catch (err: any) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}