"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import { EchoAPI } from "@/lib/api";

type WalletFromServer = {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null;
};

type Props = {
  totalMinedEcho?: number;
  verifiedWalletAddress?: string | null;
  walletFromServer?: WalletFromServer;
  onVerified?: () => void | Promise<void>;
};

function verifiedKey(address: string) {
  return `echo:walletVerified:${address}`;
}

function explorerUrl(pubkey: string) {
  return `https://solscan.io/account/${pubkey}`;
}

export default function WalletTab({
  totalMinedEcho = 0,
  verifiedWalletAddress = null,
  walletFromServer,
  onVerified,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, wallet, signMessage } = useWallet();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const serverAddress = walletFromServer?.address ?? verifiedWalletAddress ?? null;
  const serverVerified =
    walletFromServer?.verified ?? (verifiedWalletAddress ? true : false);

  const serverMismatch =
    !!address && !!serverAddress && serverAddress !== address;

  useEffect(() => {
    if (!connected || !address) {
      setIsVerified(false);
      return;
    }

    if (serverVerified && serverAddress === address) {
      setIsVerified(true);
      return;
    }

    setIsVerified(false);
  }, [connected, address, serverVerified, serverAddress]);

  useEffect(() => {
    if (!connected) {
      setIsVerified(false);
      setSolBalance(null);
      setError(null);
    }
  }, [connected]);

  useEffect(() => {
    let cancelled = false;

    async function loadBalance() {
      if (!publicKey) {
        setSolBalance(null);
        return;
      }

      try {
        const lamports = await connection.getBalance(publicKey, {
          commitment: "confirmed",
        });

        if (!cancelled) {
          setSolBalance(lamports / LAMPORTS_PER_SOL);
        }
      } catch {
        if (!cancelled) {
          setSolBalance(null);
        }
      }
    }

    loadBalance();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  async function clearLocalWalletState() {
    try {
      localStorage.removeItem(EchoAPI.STORAGE_KEY);
    } catch {}

    try {
      if (address) localStorage.removeItem(verifiedKey(address));
      if (serverAddress) localStorage.removeItem(verifiedKey(serverAddress));
    } catch {}
  }

  async function logoutOldServerSessionIfNeeded() {
    if (!serverMismatch) return;

    await clearLocalWalletState();

    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => null);

    setIsVerified(false);

    if (onVerified) {
      await onVerified();
    }
  }

  async function handleVerifyWallet() {
    setError(null);

    if (!connected || !publicKey) {
      setError("Connect your wallet first.");
      return;
    }

    if (!signMessage) {
      setError(
        "This wallet does not support message signing. Try Phantom or Solflare."
      );
      return;
    }

    try {
      setIsVerifying(true);

      if (serverMismatch) {
        await logoutOldServerSessionIfNeeded();
      }

      EchoAPI.setConnectedWalletAddress(publicKey.toBase58());

      const challengeRes = await fetch("/api/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
        }),
      });

      if (!challengeRes.ok) {
        const data = await challengeRes.json().catch(() => null);
        throw new Error(data?.error || "Could not start verification.");
      }

      const { nonce } = await challengeRes.json();

      const message =
        "ECHO Wallet Verification\n" +
        `Wallet: ${publicKey.toBase58()}\n` +
        `Nonce: ${nonce}\n\n` +
        "By signing this message, you verify ownership for ECHO eligibility.";

      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);

      const verifyRes = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          publicKey: publicKey.toBase58(),
          nonce,
          message,
          signature: Array.from(signature),
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => null);
        throw new Error(data?.error || "Verification failed.");
      }

      try {
        localStorage.setItem(verifiedKey(publicKey.toBase58()), "1");
      } catch {}

      setIsVerified(true);

      if (onVerified) {
        await onVerified();
      }

      // CRITICAL: reload so server auth cookie is picked up
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || "Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  }

  const walletLinked = connected;

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <WalletIcon className="w-5 h-5 text-white/70" />
        </div>

        <div>
          <h2 className="text-lg font-black text-white tracking-tight">
            Wallet
          </h2>
          <p className="text-xs text-white/40 font-bold">
            Secure your ECHO for the mainnet airdrop.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-black text-white/60 uppercase tracking-widest">
            Solana Wallet Connection
          </div>

          <WalletMultiButton />
        </div>

        {walletLinked ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {isVerified ? (
                  <div className="flex items-center gap-2 text-teal-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Verified
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-orange-400">
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Unverified
                    </span>
                  </div>
                )}
              </div>

              <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                {wallet?.adapter?.name ?? "Wallet"} | SOL:{" "}
                {solBalance === null ? "..." : solBalance.toFixed(4)}
              </div>
            </div>

            <div className="bg-black/30 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="font-mono text-xs text-white/80 truncate">
                {address}
              </div>

              <button
                onClick={() => copyToClipboard(address)}
                className="text-white/30 hover:text-white/70"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleVerifyWallet}
              disabled={isVerifying || isVerified}
              className="w-full h-14 rounded-2xl bg-white text-slate-950 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition disabled:opacity-50"
            >
              {isVerified
                ? "Wallet Verified"
                : isVerifying
                ? "Signing Message..."
                : "Verify Wallet (Signature)"}
            </button>

            {error && (
              <div className="text-sm text-red-300 font-bold bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-white/50 font-bold">
            Connect a wallet to continue.
          </div>
        )}
      </div>
    </div>
  );
}