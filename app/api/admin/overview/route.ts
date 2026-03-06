// app/api/admin/overview/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status?: number) {
  return NextResponse.json(data, {
  headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
});

export async function GET() {
  try {
    const ok = await isAdminAuthed();
    if (!ok) return json({ ok: false, error: "Not logged in" }, 401);

    // Keep it simple + aligned to what you said you want:
    // wallet address, total mined echo, total echo, first/most recent mining session
    const users = await prisma.user.findMany({
      include: {
        wallet: true,
        miningHistory: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        // NOTE: purchases redacted for now per your request
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    });

    const rows = await Promise.all(
      users.map(async (u) => {
        const mostRecent = await prisma.miningHistory.findFirst({
          where: { userId: u.id },
          orderBy: { createdAt: "desc" },
          select: { startedAt: true, endedAt: true, totalMined: true },
        });

        const first = u.miningHistory?.[0] ?? null;

        const totalMinedEcho = Number(u.totalMinedEcho ?? 0);
        const totalPurchasedEcho = 0; // purchases redacted for now
        const totalEcho = totalMinedEcho + totalPurchasedEcho;

        return {
          userId: u.id,
          walletAddress: u.wallet?.address ?? null,
          walletVerified: !!u.wallet?.verified,
          totalMinedEcho,
          totalPurchasedEcho,
          totalEcho,
          firstSessionAt: first?.startedAt ?? null,
          lastSessionAt: mostRecent?.startedAt ?? null,
          lastSessionMined: mostRecent?.totalMined ?? null,
        };
      })
    );

    return json({ ok: true, rows });
  } catch (err) {
    console.error("admin/overview error:", err);
    return json({ ok: false, error: "Overview failed" }, 500);
  }
}