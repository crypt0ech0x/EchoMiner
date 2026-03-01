// app/api/store/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple “catalog” for now (match your StoreTab ids)
const CATALOG: Record<string, { echoAmount: number; priceCents?: number; currency?: string }> = {
  explorer_echo: { echoAmount: 5, priceCents: 499, currency: "USD" },
  // add more items here
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

    const { sessionId, itemId } = await req.json();

    // if your frontend only sends sessionId, you can choose an itemId fallback
    const resolvedItemId = String(itemId ?? "explorer_echo");
    const meta = CATALOG[resolvedItemId] ?? { echoAmount: 0 };

    const providerSessionId = String(sessionId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      // idempotent: don’t double-credit if webhook replays
      const existing = providerSessionId
        ? await tx.purchase.findUnique({ where: { providerSessionId } })
        : null;

      if (!existing) {
        await tx.purchase.create({
          data: {
            userId: user.id,
            itemId: resolvedItemId,
            echoAmount: meta.echoAmount,
            priceCents: meta.priceCents ?? null,
            currency: meta.currency ?? null,
            providerSessionId: providerSessionId || null,
            status: "paid",
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: {
            totalPurchasedEcho: { increment: meta.echoAmount },
          },
        });
      }

      const fresh = await tx.user.findUnique({
        where: { id: user.id },
        select: { totalMinedEcho: true, totalPurchasedEcho: true },
      });

      return fresh;
    });

    return NextResponse.json({
      ok: true,
      totals: {
        mined: result?.totalMinedEcho ?? 0,
        purchased: result?.totalPurchasedEcho ?? 0,
        total: (result?.totalMinedEcho ?? 0) + (result?.totalPurchasedEcho ?? 0),
      },
    });
  } catch (err) {
    console.error("store/webhook error:", err);
    return NextResponse.json({ ok: false, error: "Webhook failed" }, { status: 500 });
  }
}