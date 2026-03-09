// app/api/store/create-intent/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMatchingWalletSession,
  isWalletSessionErr,
} from "@/lib/server-wallet-auth";
import {
  getTreasuryWalletAddress,
  solToLamports,
} from "@/lib/solana-payments";
import { getStorePackage } from "@/lib/store-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  packageId?: string;
  walletAddress?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const packageId = String(body.packageId ?? "").trim();
    const requestedWalletAddress = String(body.walletAddress ?? "").trim();

    if (!packageId) {
      return NextResponse.json(
        { ok: false, error: "Missing packageId" },
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

    const pkg = getStorePackage(packageId);
    if (!pkg) {
      return NextResponse.json(
        { ok: false, error: "Invalid package" },
        { status: 400 }
      );
    }

    const purchase = await prisma.purchase.create({
      data: {
        userId: sessionCheck.user.id,
        walletAddress: sessionCheck.walletAddress,
        packageId: pkg.id,
        solAmount: pkg.solAmount,
        echoAmount: pkg.echoAmount,
        status: "pending",
      },
      select: {
        id: true,
        userId: true,
        walletAddress: true,
        packageId: true,
        solAmount: true,
        echoAmount: true,
        status: true,
      },
    });

    return NextResponse.json({
      ok: true,
      purchaseId: purchase.id,
      package: {
        id: pkg.id,
        name: pkg.name,
        solAmount: pkg.solAmount,
        echoAmount: pkg.echoAmount,
      },
      treasuryWallet: getTreasuryWalletAddress(),
      lamports: solToLamports(pkg.solAmount),
    });
  } catch (err) {
    console.error("store/create-intent error:", err);
    return NextResponse.json(
      { ok: false, error: "Create intent failed" },
      { status: 500 }
    );
  }
}