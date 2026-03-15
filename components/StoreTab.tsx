// components/StoreTab.tsx
"use client";

import React, { useMemo, useState } from "react";
import { AppState } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import {
  STORE_PACKAGES,
  getStorePackageTotalEcho,
  getStorePackageValuePerSol,
} from "@/lib/store-packages";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Zap, CheckCircle2, Wallet, TrendingUp } from "lucide-react";

type Props = {
  state: AppState;
  onPurchase: (state: AppState) => void;
};

type PurchaseIntentResponse = {
  ok: boolean;
  purchaseId: string;
  packageId: string;
  name: string;
  solAmount: number;
  echoAmount: number;
  lamports: number;
  treasuryWallet: string;
  walletAddress: string;
  error?: string;
};

function fmtNum(n: number, digits = 0) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtSol(n: number) {
  if (n >= 1) return `${Number(n).toFixed(0)} SOL`;
  if (n >= 0.1) return `${Number(n).toFixed(1)} SOL`;
  return `${Number(n).toFixed(2)} SOL`;
}

export default function StoreTab({ state, onPurchase }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const minedEcho = Number(state.user.totalMined ?? 0);
  const purchasedEcho = Number(state.user.totalPurchased ?? 0);
  const totalEcho = minedEcho + purchasedEcho;

  const currentWalletAddress =
    state.wallet?.address ?? state.walletAddress ?? null;

  const packages = useMemo(() => STORE_PACKAGES, []);

  async function handleBuy(packageId: string) {
    setError(null);
    setMessage(null);

    if (!connected || !publicKey || !sendTransaction) {
      setError("Connect your wallet first.");
      return;
    }

    try {
      setBusyPackageId(packageId);

      EchoAPI.setConnectedWalletAddress(publicKey.toBase58());

      const intentRes = await fetch("/api/store/create-intent", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packageId,
          walletAddress: publicKey.toBase58(),
        }),
      });

      const intentData =
        (await intentRes.json().catch(() => null)) as PurchaseIntentResponse | null;

      if (!intentRes.ok || !intentData?.ok) {
        throw new Error(intentData?.error || "Could not create purchase intent.");
      }

      const latest = await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(intentData.treasuryWallet),
          lamports: intentData.lamports,
        })
      );

      const signature = await sendTransaction(tx, connection);

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );

      const confirmRes = await fetch("/api/store/confirm", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseId: intentData.purchaseId,
          txSignature: signature,
          walletAddress: publicKey.toBase58(),
        }),
      });

      const confirmData = await confirmRes.json().catch(() => null);

      if (!confirmRes.ok || !confirmData?.ok) {
        throw new Error(confirmData?.error || "Purchase confirmation failed.");
      }

      const fresh = await EchoAPI.getState();
      onPurchase(fresh);

      setMessage(
        `Success. Purchased ${Number(intentData.echoAmount ?? 0).toLocaleString()} ECHO for ${intentData.solAmount} SOL.`
      );
    } catch (e: any) {
      setError(e?.message || "Purchase failed.");
    } finally {
      setBusyPackageId(null);
    }
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-white/70" />
        </div>
        <div>
          <h2 className="text-lg font-black text-white tracking-tight">Store</h2>
          <p className="text-xs text-white/40 font-bold">
            Buy ECHO packs with SOL. Packs add ECHO directly to your balance.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Mined ECHO
            </div>
            <div className="text-lg font-black text-white mt-2">
              {fmtNum(minedEcho, 2)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Purchased ECHO
            </div>
            <div className="text-lg font-black text-white mt-2">
              {fmtNum(purchasedEcho, 2)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Total Balance
            </div>
            <div className="text-lg font-black text-emerald-300 mt-2">
              {fmtNum(totalEcho, 2)}
            </div>
          </div>
        </div>
      </div>

      {!currentWalletAddress && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-200 text-sm font-bold">
          Verify a wallet before purchasing.
        </div>
      )}

      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="w-4 h-4 text-white/60" />
          <div className="text-xs font-black text-white/60 uppercase tracking-widest">
            Optimized Pricing
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map((pkg) => {
            const totalEchoForPack = getStorePackageTotalEcho(pkg);
            const valuePerSol = getStorePackageValuePerSol(pkg);
            const projectedBalance = totalEcho + totalEchoForPack;
            const isBusy = busyPackageId === pkg.id;
            const isHighlighted = !!pkg.highlight;

            return (
              <div
                key={pkg.id}
                className={`rounded-3xl p-5 space-y-4 border transition-all ${
                  isHighlighted
                    ? "border-teal-400/40 bg-teal-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.15),0_12px_48px_rgba(20,184,166,0.12)] scale-[1.01]"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white">{pkg.name}</div>
                    <div className="text-xs text-white/40 mt-1">
                      {pkg.description}
                    </div>
                  </div>

                  {pkg.badge ? (
                    <div
                      className={`text-[10px] px-2 py-1 rounded-full font-black uppercase tracking-widest whitespace-nowrap ${
                        isHighlighted
                          ? "bg-teal-400 text-slate-950"
                          : "bg-white/10 text-white/70"
                      }`}
                    >
                      {pkg.badge}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div className="text-3xl font-black text-white">
                    +{fmtNum(totalEchoForPack)} ECHO
                  </div>
                  <div className="text-sm text-teal-300 font-black">
                    {fmtSol(pkg.solAmount)}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-white/45 font-bold">Value</span>
                    <span className="text-sm font-black text-white">
                      {fmtNum(valuePerSol, 0)} ECHO / SOL
                    </span>
                  </div>

                  {!!pkg.bonusEcho && Number(pkg.bonusEcho) > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-white/45 font-bold">Bonus</span>
                      <span className="text-sm font-black text-emerald-300">
                        +{fmtNum(pkg.bonusEcho)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-white/45 font-bold">
                      After Purchase
                    </span>
                    <span className="text-sm font-black text-cyan-300">
                      {fmtNum(projectedBalance, 2)} ECHO
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleBuy(pkg.id)}
                  disabled={isBusy}
                  className={`w-full h-12 rounded-2xl font-black text-xs uppercase tracking-widest transition disabled:opacity-50 ${
                    isHighlighted
                      ? "bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/20"
                      : "bg-white text-slate-950 hover:bg-slate-200"
                  }`}
                >
                  {isBusy ? "Processing..." : "Buy with SOL"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Wallet className="w-4 h-4 text-white/60" />
          <div className="text-xs font-black text-white/60 uppercase tracking-widest">
            Purchase Design
          </div>
        </div>

        <div className="text-sm text-white/60 leading-relaxed">
          Purchases no longer change mining multipliers. They add ECHO directly to
          your balance. The <span className="font-black text-white">Miner Pack</span>{" "}
          is highlighted as the best balance of price and value.
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200 text-sm font-bold">
          {error}
        </div>
      )}
    </div>
  );
}