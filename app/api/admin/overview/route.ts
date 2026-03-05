// app/api/admin/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getAdminWalletAllowlist(): string[] {
  const raw = process.env.ADMIN_WALLETS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  try {
    const authed = await getUserFromSessionCookie();
    if (!authed) return json({ ok: false, error: "Not logged in" }, 401);

    const allowlist = getAdminWalletAllowlist();

    // Load my wallet address
    const myWallet = await prisma.wallet.findFirst({
      where: { userId: authed.id },
      select: { address: true },
    });

    // If allowlist is set, enforce it
    if (allowlist.length > 0) {
      const addr = myWallet?.address || "";
      if (!addr || !allowlist.includes(addr)) {
        return json({ ok: false, error: "Forbidden" }, 403);
      }
    }

    // Pull users + wallet + mining info
    // Purchases intentionally redacted for now.
    const users = await prisma.user.findMany({
      include: {
        wallet: true,
        miningHistory: {
          orderBy: { createdAt: "asc" },
          take: 1, // first session
        },
        // For "most recent session", we’ll query again using desc take 1:
        // (Prisma can’t do two different orders in one include)
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const ids = users.map((u) => u.id);

    const mostRecentByUser = await prisma.miningHistory.findMany({
      where: { userId: { in: ids } },
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
    });

    const recentMap = new Map<string, (typeof mostRecentByUser)[number]>();
    for (const row of mostRecentByUser) recentMap.set(row.userId, row);

    const rows = users.map((u) => {
      const first = u.miningHistory?.[0] ?? null;
      const recent = recentMap.get(u.id) ?? null;

      const walletAddress = u.wallet?.address ?? null;

      const totalMinedEcho = u.totalMinedEcho ?? 0;

      // Purchases redacted: totalPurchasedEcho = 0 for now
      const totalPurchasedEcho = 0;

      return {
        userId: u.id,
        walletAddress,
        totalMinedEcho,
        totalPurchasedEcho,
        totalEcho: totalMinedEcho + totalPurchasedEcho,
        firstMiningSessionAt: first?.startedAt ?? null,
        mostRecentMiningSessionAt: recent?.startedAt ?? null,
      };
    });

    return json({ ok: true, rows });
  } catch (e) {
    console.error("admin/overview error:", e);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}