// app/api/store/confirm/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMatchingWalletSession,
  isWalletSessionErr,
} from "@/lib/server-wallet-auth";
import {
  getTreasuryWalletAddress,
  solToLamports,
  verifySolTransfer,
} from "@/lib/solana-payments";
import { getStorePackage } from "@/lib/store-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  purchaseId?: string;
  txSignature?: string;
  walletAddress?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const purchaseId = String(body.purchaseId ?? "").trim();
    const txSignature = String(body.txSignature ?? "").trim();
    const requestedWalletAddress = String(body.walletAddress ?? "").trim();

    if (!purchaseId || !txSignature) {
      return NextResponse.json(
        { ok: false, error: "Missing purchaseId or txSignature" },
        { status: 400 }
      );
    }

    const sessionCheck = await requireMatchingWalletSession(requestedWalletAddress);

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
      select: {
        id: true,
        userId: true,
        walletAddress: true,
        packageId: true,
        solAmount: true,
        echoAmount: true,
        txSignature: true,
        status: true,
      },
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

    if (purchase.walletAddress !== sessionCheck.walletAddress) {
      return NextResponse.json(
        { ok: false, error: "Purchase wallet mismatch" },
        { status: 409 }
      );
    }

    if (purchase.status === "confirmed") {
      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
      });
    }

    const usedSignature = await prisma.purchase.findFirst({
      where: {
        txSignature,
        id: { not: purchase.id },
      },
      select: { id: true },
    });

    if (usedSignature) {
      return NextResponse.json(
        { ok: false, error: "Transaction signature already used" },
        { status: 409 }
      );
    }

    const pkg = getStorePackage(purchase.packageId);
    if (!pkg) {
      return NextResponse.json(
        { ok: false, error: "Package config missing" },
        { status: 500 }
      );
    }

    const verification = await verifySolTransfer({
      signature: txSignature,
      expectedSender: sessionCheck.walletAddress,
      expectedRecipient: getTreasuryWalletAddress(),
      expectedLamports: solToLamports(pkg.solAmount),
    });

    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          txSignature,
          status: "confirmed",
          confirmedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: sessionCheck.user.id },
        data: {
          totalPurchasedEcho: {
            increment: pkg.echoAmount,
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      confirmed: true,
      package: {
        id: pkg.id,
        name: pkg.name,
        echoAmount: pkg.echoAmount,
        solAmount: pkg.solAmount,
      },
      txSignature,
    });
  } catch (err) {
    console.error("store/confirm error:", err);
    return NextResponse.json(
      { ok: false, error: "Confirm failed" },
      { status: 500 }
    );
  }
}