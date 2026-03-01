import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSessionCookie();
    if (!user) return json({ ok: false, error: "Not logged in" }, 401);

    const { sessionId, itemId, echoAmount } = await req.json();

    const providerRef = String(sessionId ?? "");
    const safeItemId = String(itemId ?? "unknown");
    const amount = Number(echoAmount ?? 0);

    if (!providerRef) return json({ ok: false, error: "Missing sessionId" }, 400);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ ok: false, error: "Invalid echoAmount" }, 400);
    }

    // Idempotent: if this providerRef already processed, do nothing
    const existing = await prisma.purchase.findUnique({
      where: { providerRef },
      select: { id: true },
    });
    if (existing) return json({ ok: true, alreadyProcessed: true });

    await prisma.$transaction(async (tx) => {
      await tx.purchase.create({
        data: {
          userId: user.id,
          itemId: safeItemId,
          echoAmount: amount,
          provider: "stripe",
          providerRef,
          status: "succeeded",
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { totalPurchasedEcho: { increment: amount } },
      });
    });

    return json({ ok: true });
  } catch (err) {
    console.error("store/webhook error:", err);
    return json({ ok: false, error: "Webhook failed" }, 500);
  }
}