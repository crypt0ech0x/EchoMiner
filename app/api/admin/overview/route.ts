// app/api/admin/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function parseAdminWallets(): Set<string> {
  const raw = (process.env.ADMIN_WALLETS || "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export async function GET() {
  try {
    const authed = await getUserFromSessionCookie();
    if (!authed) return json({ ok: false, error: "Not logged in" }, 401);

    // Load my wallet so we can authorize via wallet allowlist
    const me = await prisma.user.findUnique({
      where: { id: authed.id },
      select: {
        id: true,
        wallet: { select: { address: true, verified: true } },
      },
    });

    const adminWallets = parseAdminWallets();
    const myAddr = me?.wallet?.address ?? null;

    if (!myAddr || adminWallets.size === 0 || !adminWallets.has(myAddr)) {
      return json(
        {
          ok: false,
          error:
            "Forbidden. Set ADMIN_WALLETS in env (comma-separated base58 addresses).",
        },
        403
      );
    }

    // Pull the core rows we need (lean)
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        totalMinedEcho: true,
        wallet: { select: { address: true, verified: true, verifiedAt: true } },
      },
    });

    // Enrich with first/last mining session + total purchases (if Purchase exists)
    const rows = await Promise.all(
      users.map(async (u) => {
        const [firstMine, lastMine, purchaseAgg] = await Promise.all([
          prisma.miningHistory.findFirst({
            where: { userId: u.id },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true, startedAt: true, endedAt: true, totalMined: true },
          }),
          prisma.miningHistory.findFirst({
            where: { userId: u.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true, startedAt: true, endedAt: true, totalMined: true },
          }),
          prisma.purchase.aggregate({
            where: { userId: u.id },
            _sum: { amountEcho: true },
          }),
        ]);

        const totalPurchasedEcho = Number(purchaseAgg._sum.amountEcho ?? 0);
        const totalMinedEcho = Number(u.totalMinedEcho ?? 0);

        return {
          userId: u.id,
          walletAddress: u.wallet?.address ?? null,
          walletVerified: !!u.wallet?.verified,
          walletVerifiedAt: u.wallet?.verifiedAt ? u.wallet.verifiedAt.toISOString() : null,

          totalMinedEcho,
          totalPurchasedEcho,
          totalEcho: totalMinedEcho + totalPurchasedEcho,

          firstMiningSessionAt: firstMine?.startedAt ? firstMine.startedAt.toISOString() : null,
          mostRecentMiningSessionAt: lastMine?.startedAt ? lastMine.startedAt.toISOString() : null,

          // optional: useful for sanity
          userCreatedAt: u.createdAt.toISOString(),
        };
      })
    );

    return json({ ok: true, rows });
  } catch (err: any) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}