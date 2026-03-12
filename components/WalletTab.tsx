// components/WalletTab.tsx
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
  const [error, setError] = useState<string | null>(null);

  const address = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const serverAddress = walletFromServer?.address ?? verifiedWalletAddress ?? null;
  const serverVerified =
    walletFromServer?.verified ?? Boolean(verifiedWalletAddress);

  const walletLinked = connected && !!address;
  const exactServerMatch = !!address && !!serverAddress && address === serverAddress;
  const walletIsVerified = walletLinked && exactServerMatch && serverVerified;
  const walletMismatch = !!address && !!serverAddress && address !== serverAddress;

  useEffect(() => {
    if (!publicKey) {
      setSolBalance(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const lamports = await connection.getBalance(publicKey, "confirmed");
        if (!cancelled) {
          setSolBalance(lamports / LAMPORTS_PER_SOL);
        }
      } catch {
        if (!cancelled) setSolBalance(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  useEffect(() => {
    if (walletLinked && address) {
      EchoAPI.setConnectedWalletAddress(address);
    } else {
      EchoAPI.setConnectedWalletAddress(null);
    }
  }, [walletLinked, address]);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  async function handleVerifyWallet() {
    setError(null);

    if (!walletLinked || !publicKey) {
      setError("Connect your wallet first.");
      return;
    }

    if (!signMessage) {
      setError("This wallet does not support message signing.");
      return;
    }

    try {
      setIsVerifying(true);

      const challengeRes = await fetch("/api/wallet/challenge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
        }),
      });

      const challengeData = await challengeRes.json().catch(() => null);

      if (!challengeRes.ok || !challengeData?.nonce) {
        throw new Error(challengeData?.error || "Failed to create challenge.");
      }

      const nonce = challengeData.nonce;

      const message =
        "ECHO Wallet Verification\n" +
        `Wallet: ${publicKey.toBase58()}\n` +
        `Nonce: ${nonce}\n\n` +
        "Sign this message to verify your wallet.";

      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);

      const verifyRes = await fetch("/api/wallet/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: publicKey.toBase58(),
          nonce,
          message,
          signature: Array.from(signature),
        }),
      });

      const verifyData = await verifyRes.json().catch(() => null);

      if (!verifyRes.ok) {
        throw new Error(verifyData?.error || "Verification failed.");
      }

      if (verifyData?.sessionId) {
        EchoAPI.setSessionId(verifyData.sessionId);
      }

      if (onVerified) {
        await onVerified();
      }
    } catch (e: any) {
      setError(e?.message || "Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <WalletIcon className="w-5 h-5 text-white/70" />
        </div>
        <div>
          <h2 className="text-lg font-black text-white tracking-tight">Wallet</h2>
          <p className="text-xs text-white/40 font-bold">
            Verify your wallet before starting a mining session.
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
                {walletIsVerified ? (
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
                      Verification Required
                    </span>
                  </div>
                )}
              </div>

              <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                {wallet?.adapter?.name ?? "Wallet"}{" "}
                <span className="text-white/15">|</span>{" "}
                SOL: {solBalance === null ? "..." : solBalance.toFixed(4)}
              </div>
            </div>

            <div className="bg-black/30 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="font-mono text-xs text-white/80 truncate">
                {address}
              </div>
              <button
                onClick={() => copyToClipboard(address)}
                className="text-white/30 hover:text-white/70 transition-colors"
                aria-label="Copy address"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            {walletMismatch && (
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="text-[11px] font-black text-orange-300 uppercase tracking-widest mb-2">
                  Connected wallet differs from verified wallet
                </div>
                <div className="text-xs text-white/50 font-bold break-all mb-2">
                  Verified wallet: {serverAddress}
                </div>
                <div className="text-xs text-white/40">
                  Press Verify Wallet to switch your login to this connected wallet.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-2xl border border-white/10 p-4">
                <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                  Snapshot Alloc
                </div>
                <div className="text-lg font-black text-white tabular-nums">
                  {Number(totalMinedEcho).toFixed(2)}
                </div>
              </div>

              <div className="glass rounded-2xl border border-white/10 p-4">
                <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                  Airdrop Readiness
                </div>
                <div className="text-lg font-black text-white tabular-nums">
                  {walletIsVerified ? "100%" : "Verify"}
                </div>
              </div>
            </div>

            <button
              onClick={() =>
                window.open(explorerUrl(address), "_blank", "noopener,noreferrer")
              }
              className="w-full h-12 rounded-2xl glass border border-white/10 text-xs font-black uppercase tracking-widest text-white/70 hover:bg-white/5 flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View on Solscan
            </button>

            <button
              onClick={handleVerifyWallet}
              disabled={isVerifying}
              className="w-full h-14 rounded-2xl bg-white text-slate-950 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition disabled:opacity-50 disabled:hover:bg-white flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                "Signing Message..."
              ) : walletIsVerified ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Wallet Verified
                </>
              ) : walletMismatch ? (
                "Verify Wallet to Switch"
              ) : (
                "Verify Wallet (Signature)"
              )}
            </button>

            {error && (
              <div className="text-sm text-red-300 font-bold bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-white/50 font-bold">
            Connect a wallet to continue. We use a signature to link your account.
          </div>
        )}
      </div>
    </div>
  );
}