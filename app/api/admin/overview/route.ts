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
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        wallet: true,
        miningHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: 500,
    });

    const rows = users.map((u) => {
      const totalMinedEcho = n(u.totalMinedEcho);

      return {
        userId: u.id,
        walletAddress: u.wallet?.address ?? null,
        walletVerified: !!u.wallet?.verified,
        totalMinedEcho,
        totalEcho: totalMinedEcho, // same for now
        mostRecentMiningSessionAt: u.miningHistory?.[0]?.createdAt ?? null,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error("admin/overview error:", err);
    return NextResponse.json(
      { ok: false, error: "Admin overview failed" },
      { status: 500 }
    );
  }
}