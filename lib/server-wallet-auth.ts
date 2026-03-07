// lib/server-wallet-auth.ts
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export type WalletSessionOk = {
  ok: true;
  user: NonNullable<Awaited<ReturnType<typeof getUserFromSessionCookie>>>;
  walletAddress: string;
};

export type WalletSessionErr = {
  ok: false;
  status: 401 | 409;
  error: string;
  serverWalletAddress?: string | null;
  requestedWalletAddress?: string | null;
};

export type WalletSessionCheck = WalletSessionOk | WalletSessionErr;

export function isWalletSessionErr(
  value: WalletSessionCheck
): value is WalletSessionErr {
  return value.ok === false;
}

export async function requireMatchingWalletSession(
  requestedWalletAddress?: string | null
): Promise<WalletSessionCheck> {
  const authedUser = await getUserFromSessionCookie();

  if (!authedUser) {
    return {
      ok: false,
      status: 401,
      error: "Not logged in",
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  const wallet = await prisma.wallet.findFirst({
    where: { userId: authedUser.id },
    select: { address: true, verified: true },
  });

  if (!wallet?.verified || !wallet.address) {
    return {
      ok: false,
      status: 401,
      error: "Wallet not verified",
      serverWalletAddress: wallet?.address ?? null,
      requestedWalletAddress: requestedWalletAddress ?? null,
    };
  }

  const requested = (requestedWalletAddress ?? "").trim();

  if (requested && requested !== wallet.address) {
    return {
      ok: false,
      status: 409,
      error: "Wallet session mismatch",
      serverWalletAddress: wallet.address,
      requestedWalletAddress: requested,
    };
  }

  return {
    ok: true,
    user: authedUser,
    walletAddress: wallet.address,
  };
}