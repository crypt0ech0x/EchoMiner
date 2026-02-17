"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  ShieldAlert,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";

type Props = {
  totalMinedEcho?: number;
  verifiedWalletAddress?: string | null;
};

function verifiedKey(address: string) {
  return `echo:walletVerified:${address}`;
}

export default function WalletTab({ totalMinedEcho = 0, verifiedWalletAddress = null }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, wallet, signMessage } = useWallet();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  // 1) If you already have a verified wallet stored server-side, reflect it
  useEffect(() => {
    if (verifiedWalletAddress && verifiedWalletAddress.length > 0) setIsVerified(true);
  }, [verifiedWalletAddress]);

  // 2) Persist verification across tab switches (component unmounts)
  useEffect(() => {
    if (!address) {
      setIsVerified(false);
      return;
    }

    // If server says it's verified, trust server
    if (verifiedWalletAddress && verifiedWalletAddress === address) {
      setIsVerified(true);
      return;
    }

    // Otherwise, load local verification flag
    try {
      const saved = localStorage.getItem(verifiedKey(address));
      setIsVerified(saved === "1");
    } catch {
      // ignore if storage unavailable
      setIsVerified(false);
    }
  }, [address, verifiedWalletAddress]);

  // 3) Clear verified UI state when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setIsVerified(false);
      setSolBalance(null);
    }
  }, [connected]);

  useEffect(() => {
    let cancelled = false;

    async function loadBalance() {
      if (!publicKey) {
        setSolBalance(null);
        return;
      }
      const lamports = await connection.getBalance(publicKey, { commitment: "confirmed" });
      if (!cancelled) setSolBalance(lamports / LAMPORTS_PER_SOL);
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

  function explorerUrl(pubkey: string) {
    return `https://solscan.io/account/${pubkey}`;
  }

  async function handleVerifyWallet() {
    setError(null);

    if (!connected || !publicKey) {
      setError("Connect your wallet first.");
      return;
    }
    if (!signMessage) {
      setError("This wallet does not support message signing. Try Phantom or Solflare.");
      return;
    }

    try {
      setIsVerifying(true);

      const challengeRes = await fetch("/api/wallet/challenge", { method: "POST" });
      if (!challengeRes.ok) throw new Error("Could not start verification. Try again.");
      const { nonce } = (await challengeRes.json()) as { nonce: string };

      const message =
        `ECHO Wallet Verification\n` +
        `Wallet: ${publicKey.toBase58()}\n` +
        `Nonce: ${nonce}\n` +
        `\nBy signing this message, you verify ownership for ECHO airdrop eligibility.`;

      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);

      const verifyRes = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      // Save verified status locally so it persists across tab switches
      try {
        localStorage.setItem(verifiedKey(publicKey.toBase58()), "1");
      } catch {
        // ignore
      }

      setIsVerified(true);
    } catch (e: any) {
      setError(e?.message || "Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  }

  const walletLinked = connected;

  return (
    <div className="px-6 space-y-6 animate-in slide-in-from-left duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-white tracking-tight">Wallet</h2>
        <p className="text-slate-400 text-sm">Secure your ECHO for the mainnet airdrop.</p>
      </div>

      <div className="glass rounded-[32px] p-8 border border-white/10 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/10 blur-[80px] -z-10" />

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">
            Solana Wallet Connection
          </div>
          <WalletMultiButton />
        </div>

        {walletLinked ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-3xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-white text-lg">Wallet Connected</h3>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded uppercase border ${
                      isVerified
                        ? "bg-teal-400/20 text-teal-400 border-teal-400/20"
                        : "bg-white/10 text-white/60 border-white/10"
                    }`}
                  >
                    {isVerified ? "Verified" : "Unverified"}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs font-mono text-slate-500 truncate max-w-[220px]">
                    {address}
                  </span>
                  <button
                    onClick={() => copyToClipboard(address)}
                    className="text-slate-600 hover:text-white transition-colors"
                    aria-label="Copy address"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-white/50">
                  Wallet: <span className="text-white/70">{wallet?.adapter?.name ?? "Wallet"}</span>{" "}
                  <span className="text-white/50">|</span>{" "}
                  SOL:{" "}
                  <span className="text-white/70">
                    {solBalance === null ? "..." : solBalance.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">
                  Snapshot Alloc
                </p>
                <p className="text-2xl font-black text-white tabular-nums">
                  {Number(totalMinedEcho).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">
                  Airdrop Readiness
                </p>
                <p className={`text-2xl font-black ${isVerified ? "text-teal-400" : "text-white/50"}`}>
                  {isVerified ? "100%" : "-"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => window.open(explorerUrl(address), "_blank", "noopener,noreferrer")}
                className="w-full h-14 glass rounded-2xl text-xs font-bold text-slate-400 border border-white/10 flex items-center justify-center gap-2 hover:bg-white/5 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                View On Solscan
              </button>

              {!isVerified ? (
                <button
                  onClick={handleVerifyWallet}
                  disabled={isVerifying}
                  className={`w-full h-16 rounded-[24px] text-white font-black uppercase tracking-widest shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${
                    isVerifying
                      ? "bg-slate-800 animate-pulse"
                      : "bg-gradient-to-r from-purple-600 to-indigo-700 shadow-purple-600/30 hover:brightness-110"
                  }`}
                >
                  {isVerifying ? (
                    <>
                      <Key className="w-5 h-5 animate-spin" />
                      Signing Message...
                    </>
                  ) : (
                    <>
                      <img
                        src="https://cryptologos.cc/logos/solana-sol-logo.png"
                        className="w-5 h-5 brightness-200"
                        alt="SOL"
                      />
                      Verify Wallet (Signature)
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="w-full h-16 bg-teal-500/10 border border-teal-500/20 rounded-[24px] text-xs font-black text-teal-300 uppercase tracking-widest cursor-not-allowed"
                >
                  Wallet Verified
                </button>
              )}

              <button
                disabled
                className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl text-xs font-black text-slate-600 uppercase tracking-widest cursor-not-allowed"
              >
                Claims Launching Phase 3
              </button>

              {error && (
                <div className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
                  {error}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/10 shadow-inner">
              <WalletIcon className="w-12 h-12 text-white/30" />
            </div>

            <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Connect & Verify</h3>
            <p className="text-sm text-slate-500 mb-10 max-w-[280px] leading-relaxed">
              We use <span className="text-white font-bold">cryptographic signatures</span> to link
              your account. Mined ECHO is stored off-chain until the TGE snapshot.
            </p>

            <div className="w-full">
              <WalletMultiButton />
            </div>
          </div>
        )}
      </div>

      <div className="glass rounded-[24px] p-6 border border-yellow-500/10 flex gap-4">
        <ShieldAlert className="w-6 h-6 text-yellow-500 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-black text-yellow-500 uppercase tracking-tight">
            Pre-launch Protocol
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Your mined balance is a <span className="text-white">virtual accrual</span>. It will be
            snapshotted exactly 24h before token launch. Duplicate accounts or bot behavior will
            void eligibility.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">
          Eligibility Checklist
        </h4>

        <div className="space-y-3">
          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-5 h-5 ${isVerified ? "text-teal-400" : "text-slate-600"}`} />
              <span className={`text-xs font-bold ${isVerified ? "text-white" : "text-slate-600"}`}>
                Wallet Verified
              </span>
            </div>
            {isVerified ? (
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
            ) : (
              <div className="w-4 h-4 rounded-full border border-slate-700" />
            )}
          </div>

          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-teal-400 w-5 h-5" />
              <span className="text-xs font-bold text-white">Minimum Balance (&gt;0.01 ECHO)</span>
            </div>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>

          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-slate-600 w-5 h-5" />
              <span className="text-xs font-bold text-slate-600">KYC Verification (Phase 2)</span>
            </div>
            <div className="w-4 h-4 rounded-full border border-slate-700" />
          </div>
        </div>
      </div>

      <button className="w-full group py-6 flex items-center justify-between text-slate-500 hover:text-slate-300 transition-colors border-t border-white/5">
        <span className="text-xs font-black uppercase tracking-widest">Read Airdrop Terms</span>
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}
