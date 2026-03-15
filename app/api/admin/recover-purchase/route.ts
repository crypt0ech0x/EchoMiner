import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorePackage } from "@/lib/store-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  purchaseId?: string;
  txSignature?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const purchaseId = String(body.purchaseId ?? "").trim();
    const txSignature = String(body.txSignature ?? "").trim();

    if (!purchaseId || !txSignature) {
      return NextResponse.json(
        { ok: false, error: "Missing purchaseId or txSignature" },
        { status: 400 }
      );
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase) {
      return NextResponse.json(
        { ok: false, error: "Purchase not found" },
        { status: 404 }
      );
    }

    if (purchase.status === "confirmed") {
      return NextResponse.json({
        ok: true,
        message: "Purchase already confirmed",
      });
    }

    const pkg = getStorePackage(purchase.packageId);

    if (!pkg) {
      return NextResponse.json(
        { ok: false, error: "Package not found" },
        { status: 500 }
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          status: "confirmed",
          txSignature,
          confirmedAt: now,
        },
      });

      await tx.user.update({
        where: { id: purchase.userId },
        data: {
          totalPurchasedEcho: {
            increment: pkg.echoAmount,
          },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: purchase.userId,
          type: "purchase_credit",
          amountEcho: pkg.echoAmount,
          sourceType: "purchase",
          sourceId: purchase.id,
          metadataJson: {
            packageId: pkg.id,
            solAmount: pkg.solAmount,
            txSignature,
            recovered: true,
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      recovered: true,
      echoAmount: pkg.echoAmount,
      purchaseId,
      txSignature,
    });
  } catch (err: any) {
    console.error("recover purchase error:", err);

    return NextResponse.json(
      { ok: false, error: err?.message || "Recovery failed" },
      { status: 500 }
    );
  }
}