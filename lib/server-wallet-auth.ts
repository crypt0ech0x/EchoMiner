// lib/server-wallet-auth.ts
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export type WalletSessionCheck =
  | {
      ok: true;
      user: Awaited<ReturnType<typeof getUserFromSessionCookie>>;
      walletAddress: string;
    }
  | {
      ok: false;
      status: 401 | 409;
      error: string;
      serverWalletAddress?: string | null;
      requestedWalletAddress?: string | null;
    };

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
      requestedWalletAddress: requestedWalletAddress ?? null,
      serverWalletAddress: wallet?.address ?? null,
    };
  }

  const normalizedRequested = (requestedWalletAddress ?? "").trim();

  if (normalizedRequested && normalizedRequested !== wallet.address) {
    return {
      ok: false,
      status: 409,
      error: "Wallet session mismatch",
      requestedWalletAddress: normalizedRequested,
      serverWalletAddress: wallet.address,
    };
  }

  return {
    ok: true,
    user: authedUser,
    walletAddress: wallet.address,
  };
}