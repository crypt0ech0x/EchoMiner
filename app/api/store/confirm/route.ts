// app/api/store/confirm/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMatchingWalletSession,
  isWalletSessionErr,
} from "@/lib/server-wallet-auth";
import { getStorePackage } from "@/lib/store-packages";
import {
  getTreasuryWalletAddress,
  solToLamports,
  verifySolTransfer,
} from "@/lib/solana-payments";
import { getPurchaseMultiplier } from "@/lib/economy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  purchaseId?: string;
  txSignature?: string;
  walletAddress?: string;
};

export async function POST(req: Request) {
  try {
    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const purchaseId = String(body.purchaseId ?? "").trim();
    const txSignature = String(body.txSignature ?? "").trim();
    const requestedWalletAddress = String(body.walletAddress ?? "").trim();

    if (!purchaseId || !txSignature) {
      return NextResponse.json(
        { ok: false, error: "Missing purchaseId or txSignature" },
        { status: 400 }
      );
    }

    const sessionCheck = await requireMatchingWalletSession(
      req,
      requestedWalletAddress
    );

    if (isWalletSessionErr(sessionCheck)) {
      return NextResponse.json(
        {
          ok: false,
          error: sessionCheck.error,
          serverWalletAddress: sessionCheck.serverWalletAddress ?? null,
          requestedWalletAddress: sessionCheck.requestedWalletAddress ?? null,
        },
        { status: sessionCheck.status }
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

    if (purchase.userId !== sessionCheck.user.id) {
      return NextResponse.json(
        { ok: false, error: "Purchase does not belong to this user" },
        { status: 403 }
      );
    }

    if (purchase.status === "confirmed") {
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }

    if (purchase.txSignature && purchase.txSignature !== txSignature) {
      return NextResponse.json(
        { ok: false, error: "Purchase already tied to another signature" },
        { status: 409 }
      );
    }

    const existingSignature = await prisma.purchase.findFirst({
      where: {
        txSignature,
        NOT: { id: purchase.id },
      },
      select: { id: true },
    });

    if (existingSignature) {
      return NextResponse.json(
        { ok: false, error: "Transaction signature already used" },
        { status: 409 }
      );
    }

    const pkg = getStorePackage(purchase.packageId);
    if (!pkg) {
      return NextResponse.json(
        { ok: false, error: "Purchase package config missing" },
        { status: 500 }
      );
    }

    const verification = await verifySolTransfer({
      signature: txSignature,
      expectedSender: sessionCheck.walletAddress,
      expectedRecipient: getTreasuryWalletAddress(),
      expectedLamports: solToLamports(pkg.solAmount),
    });

    if ("error" in verification) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: 400 }
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          txSignature,
          status: "confirmed",
          confirmedAt: now,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: purchase.userId },
        data: {
          totalPurchasedEcho: { increment: purchase.echoAmount },
        },
        select: {
          totalPurchasedEcho: true,
        },
      });

      await tx.user.update({
        where: { id: purchase.userId },
        data: {
          purchaseMultiplier: getPurchaseMultiplier(updatedUser.totalPurchasedEcho),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: purchase.userId,
          type: "purchase_credit",
          amountEcho: purchase.echoAmount,
          sourceType: "purchase",
          sourceId: purchase.id,
          metadataJson: {
            packageId: purchase.packageId,
            solAmount: purchase.solAmount,
            txSignature,
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      confirmedAt: now.toISOString(),
      echoAmount: purchase.echoAmount,
      solAmount: purchase.solAmount,
      txSignature,
      slot: verification.slot,
    });
  } catch (err) {
    console.error("store/confirm error:", err);
    return NextResponse.json(
      { ok: false, error: "Confirm failed" },
      { status: 500 }
    );
  }
}