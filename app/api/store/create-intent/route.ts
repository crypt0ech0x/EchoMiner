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
import { getTreasuryWalletAddress, solToLamports } from "@/lib/solana-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  packageId?: string;
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

    const packageId = String(body.packageId ?? "").trim();
    const requestedWalletAddress = String(body.walletAddress ?? "").trim();

    if (!packageId) {
      return NextResponse.json(
        { ok: false, error: "Missing packageId" },
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

    const pkg = getStorePackage(packageId);
    if (!pkg) {
      return NextResponse.json(
        { ok: false, error: `Invalid packageId: ${packageId}` },
        { status: 400 }
      );
    }

    const totalEcho = getStorePackageTotalEcho(pkg);
    const treasuryWallet = getTreasuryWalletAddress();

    if (!treasuryWallet) {
      return NextResponse.json(
        { ok: false, error: "Treasury wallet is not configured" },
        { status: 500 }
      );
    }

    const lamports = solToLamports(pkg.solAmount);

    const purchase = await prisma.purchase.create({
      data: {
        userId: sessionCheck.user.id,
        walletAddress: sessionCheck.walletAddress,
        packageId: pkg.id,
        solAmount: pkg.solAmount,
        echoAmount: totalEcho,
        status: "pending",
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({
      ok: true,
      purchaseId: purchase.id,
      packageId: pkg.id,
      name: pkg.name,
      solAmount: pkg.solAmount,
      echoAmount: totalEcho,
      baseEchoAmount: pkg.echoAmount,
      bonusEchoAmount: Number(pkg.bonusEcho ?? 0),
      lamports,
      treasuryWallet,
      walletAddress: sessionCheck.walletAddress,
    });
  } catch (err: any) {
    console.error("store/create-intent error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Create intent failed",
      },
      { status: 500 }
    );
  }
}