import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMatchingWalletSession,
  isWalletSessionErr,
} from "@/lib/server-wallet-auth";
import {
  getStorePackage,
  getStorePackageTotalEcho,
} from "@/lib/store-packages";
import {
  getTreasuryWalletAddress,
  solToLamports,
  verifySolTransfer,
} from "@/lib/solana-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  purchaseId?: string;
  txSignature?: string;
  walletAddress?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifySolTransferWithRetry(args: {
  signature: string;
  expectedSender: string;
  expectedRecipient: string;
  expectedLamports: number;
  attempts?: number;
  delayMs?: number;
}) {
  const attempts = args.attempts ?? 6;
  const delayMs = args.delayMs ?? 1500;

  let lastResult: any = null;

  for (let i = 0; i < attempts; i++) {
    lastResult = await verifySolTransfer({
      signature: args.signature,
      expectedSender: args.expectedSender,
      expectedRecipient: args.expectedRecipient,
      expectedLamports: args.expectedLamports,
    });

    if (!("error" in lastResult)) {
      return lastResult;
    }

    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return lastResult;
}

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
      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
        echoAmount: purchase.echoAmount,
        solAmount: purchase.solAmount,
        txSignature: purchase.txSignature,
      });
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

    const totalEcho = getStorePackageTotalEcho(pkg);

    const verification = await verifySolTransferWithRetry({
      signature: txSignature,
      expectedSender: sessionCheck.walletAddress,
      expectedRecipient: getTreasuryWalletAddress(),
      expectedLamports: solToLamports(pkg.solAmount),
      attempts: 6,
      delayMs: 1500,
    });

    if ("error" in verification) {
      return NextResponse.json(
        {
          ok: false,
          error: verification.error || "Failed to verify transaction",
        },
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
          solAmount: pkg.solAmount,
          echoAmount: totalEcho,
        },
      });

      await tx.user.update({
        where: { id: purchase.userId },
        data: {
          totalPurchasedEcho: { increment: totalEcho },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: purchase.userId,
          type: "purchase_credit",
          amountEcho: totalEcho,
          sourceType: "purchase",
          sourceId: purchase.id,
          metadataJson: {
            packageId: pkg.id,
            packageName: pkg.name,
            solAmount: pkg.solAmount,
            baseEchoAmount: pkg.echoAmount,
            bonusEchoAmount: Number(pkg.bonusEcho ?? 0),
            totalEchoCredited: totalEcho,
            txSignature,
            slot: verification.slot,
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      confirmedAt: now.toISOString(),
      echoAmount: totalEcho,
      baseEchoAmount: pkg.echoAmount,
      bonusEchoAmount: Number(pkg.bonusEcho ?? 0),
      solAmount: pkg.solAmount,
      txSignature,
      slot: verification.slot,
    });
  } catch (err: any) {
    console.error("store/confirm error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Confirm failed" },
      { status: 500 }
    );
  }
}