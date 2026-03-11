// lib/server-wallet-auth.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

type WalletSessionErr = {
  ok: false;
  status: number;
  error: string;
  serverWalletAddress?: string | null;
  requestedWalletAddress?: string | null;
};

type WalletSessionOk = {
  ok: true;
  user: {
    id: string;
    wallet?: {
      address: string | null;
      verified: boolean;
      verifiedAt: Date | null;
    } | null;
  };
  walletAddress: string;
};

export function isWalletSessionErr(
  value: WalletSessionErr | WalletSessionOk
): value is WalletSessionErr {
  return value.ok === false;
}

export async function requireMatchingWalletSession(
  req: Request,
  requestedWalletAddress?: string | null
): Promise<WalletSessionErr | WalletSessionOk> {
  const authedUser = await getUserFromRequest(req);

  if (!authedUser) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  const wallet = await prisma.wallet.findFirst({
    where: { userId: authedUser.id },
    select: {
      address: true,
      verified: true,
      verifiedAt: true,
    },
  });

  const serverWalletAddress = wallet?.address ?? null;

  if (!wallet || !wallet.address || !wallet.verified) {
    return {
      ok: false,
      status: 401,
      error: "Wallet not verified",
      serverWalletAddress,
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  if (
    requestedWalletAddress &&
    requestedWalletAddress.trim() &&
    requestedWalletAddress !== wallet.address
  ) {
    return {
      ok: false,
      status: 409,
      error: "Wallet session mismatch",
      serverWalletAddress,
      requestedWalletAddress,
    };
  }

  return {
    ok: true,
    user: {
      id: authedUser.id,
      wallet: wallet
        ? {
            address: wallet.address,
            verified: wallet.verified,
            verifiedAt: wallet.verifiedAt,
          }
        : null,
    },
    walletAddress: wallet.address,
  };
}