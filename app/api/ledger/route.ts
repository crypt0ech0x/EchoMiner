// app/api/ledger/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromSessionCookie();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    ok: true,
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amountEcho: e.amountEcho,
      createdAt: e.createdAt.toISOString(),
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      metadataJson: e.metadataJson,
    })),
  });
}