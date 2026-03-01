import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export async function GET() {
  try {
    // NOTE: This assumes you have a Purchase model.
    // If you DON’T yet, keep the purchaseSum part as 0 for now (see note below).
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        wallet: true,
        miningHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        // If you add Purchase model:
        purchases: {
          select: { amountEcho: true, createdAt: true },
        },
      } as any,
    });

    const rows = users.map((u: any) => {
      const totalPurchasedEcho =
        Array.isArray(u.purchases) ? u.purchases.reduce((acc: number, p: any) => acc + n(p.amountEcho), 0) : 0;

      const totalMinedEcho = n(u.totalMinedEcho);
      const totalEcho = totalMinedEcho + totalPurchasedEcho;

      return {
        userId: u.id,
        createdAt: u.createdAt,
        walletAddress: u.wallet?.address ?? null,
        walletVerified: !!u.wallet?.verified,
        totalPurchasedEcho,
        totalMinedEcho,
        totalEcho,
        mostRecentMiningSessionAt: u.miningHistory?.[0]?.createdAt ?? null,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error("admin/overview error:", err);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
}