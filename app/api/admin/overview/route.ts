// app/api/admin/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  try {
    const authed = await getUserFromSessionCookie();
    if (!authed) return json({ ok: false, error: "Not logged in" }, 401);

    // Basic admin gate (adjust if your User model uses a different field)
    const me = await prisma.user.findUnique({
      where: { id: authed.id },
      select: { id: true, isAdmin: true },
    });

    if (!me?.isAdmin) return json({ ok: false, error: "Forbidden" }, 403);

    // Pull users + wallet + miningHistory summary (no purchases for now)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        createdAt: true,
        totalMinedEcho: true,
        wallet: {
          select: { address: true, verified: true, verifiedAt: true },
        },
        miningHistory: {
          select: { startedAt: true, endedAt: true, totalMined: true, createdAt: true },
          orderBy: { startedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 250, // keep it sane; add pagination later if you want
    });

    const rows = users.map((u) => {
      const histories = u.miningHistory ?? [];
      const first = histories[0]?.startedAt ?? null;
      const last = histories.length ? histories[histories.length - 1]?.startedAt ?? null : null;

      const totalSessions = histories.length;

      const totalMined = Number(u.totalMinedEcho ?? 0);

      // Purchases redacted for now (keep field so UI doesn't change later)
      const totalPurchased = 0;

      return {
        userId: u.id,
        walletAddress: u.wallet?.address ?? null,
        walletVerified: !!u.wallet?.verified,
        walletVerifiedAt: u.wallet?.verifiedAt ? u.wallet.verifiedAt.toISOString() : null,

        totalMinedEcho: totalMined,
        totalPurchasedEcho: totalPurchased,
        totalEcho: totalMined + totalPurchased,

        firstMiningAt: first ? first.toISOString() : null,
        lastMiningAt: last ? last.toISOString() : null,
        totalSessions,
      };
    });

    return json({ ok: true, rows });
  } catch (err) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}