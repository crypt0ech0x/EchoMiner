// app/api/store/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  sessionId: string; // providerRef
  // optionally include itemId/amountEcho if your checkout provides it
  amountEcho?: number;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSessionCookie();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Body | null;
    const providerRef = (body?.sessionId ?? "").trim();
    const amountEcho = Number(body?.amountEcho ?? 0);

    if (!providerRef) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // For now, if you’re simulating purchases:
    const credit = Number.isFinite(amountEcho) && amountEcho > 0 ? amountEcho : 5.0;

    // Idempotent insert
    const existing = await prisma.purchase.findUnique({
      where: { providerRef },
      select: { id: true },
    });

    if (!existing) {
      await prisma.purchase.create({
        data: {
          userId: user.id,
          provider: "stripe",
          providerRef,
          amountEcho: credit,
        },
      });
    }

    // If you want “total echo” to include purchases, you can add another field later.
    // For now, you can also increment totalMinedEcho, or keep a separate purchased field.
    // Here we keep purchases separate and do NOT mutate mined total.

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("store/webhook error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}