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

    // If you have an isAdmin field, enforce it. If you don't, comment this out.
    // const me = await prisma.user.findUnique({ where: { id: authed.id }, select: { isAdmin: true } });
    // if (!me?.isAdmin) return json({ ok: false, error: "Forbidden" }, 403);

    // Pull “users” with wallet + mining history summary
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        totalMinedEcho: true,
        wallet: {
          select: { address: true, verified: true, verifiedAt: true },
        },
        miningHistory: {
          orderBy: { startedAt: "asc" },
          select: { startedAt: true, endedAt: true },
        },
      },
      take: 250, // adjust later
    });

    const rows = users.map((u) => {
      const history = u.miningHistory ?? [];
      const first = history.length ? history[0] : null;
      const last = history.length ? history[history.length - 1] : null;

      return {
        userId: u.id,
        walletAddress: u.wallet?.address ?? null,
        walletVerified: u.wallet?.verified ?? false,
        totalMinedEcho: u.totalMinedEcho ?? 0,
        firstMiningSessionAt: first?.startedAt ?? null,
        lastMiningSessionAt: last?.startedAt ?? null,
      };
    });

    return json({ ok: true, rows });
  } catch (err) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Admin overview failed" }, 500);
  }
}