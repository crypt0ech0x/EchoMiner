// lib/server-wallet-auth.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

type WalletSessionError = {
  ok: false;
  status: number;
  error: string;
  serverWalletAddress?: string | null;
  requestedWalletAddress?: string | null;
};

type WalletSessionSuccess = {
  ok: true;
  user: {
    id: string;
    wallet?: {
      address: string;
      verified: boolean;
      verifiedAt: Date | null;
    } | null;
  };
  walletAddress: string;
};

export function isWalletSessionErr(
  result: WalletSessionError | WalletSessionSuccess
): result is WalletSessionError {
  return !result.ok;
}

export async function requireMatchingWalletSession(
  req: Request,
  requestedWalletAddress?: string | null
): Promise<WalletSessionError | WalletSessionSuccess> {
  const user = await getUserFromRequest(req);

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  const wallet = await prisma.wallet.findFirst({
    where: {
      userId: user.id,
      verified: true,
    },
    select: {
      address: true,
      verified: true,
      verifiedAt: true,
    },
  });

  if (!wallet?.address) {
    return {
      ok: false,
      status: 401,
      error: "No verified wallet on session",
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  const trimmedRequested = (requestedWalletAddress ?? "").trim();

  if (trimmedRequested && trimmedRequested !== wallet.address) {
    return {
      ok: false,
      status: 409,
      error: "Wallet session mismatch",
      serverWalletAddress: wallet.address,
      requestedWalletAddress: trimmedRequested,
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      wallet,
    },
    walletAddress: wallet.address,
  };
}