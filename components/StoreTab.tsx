// components/StoreTab.tsx
"use client";

import React, { useState } from "react";
import { AppState } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import { STORE_PACKAGES } from "@/lib/store-packages";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Zap, CheckCircle2, Wallet } from "lucide-react";

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

export default function StoreTab({ state, onPurchase }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        `Success. Purchased ${intentData.echoAmount} ECHO for ${intentData.solAmount} SOL.`
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
            Buy ECHO with SOL and permanently increase your mining multiplier.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Mined ECHO
            </div>
            <div className="text-lg font-black text-white mt-2">
              {Number(state.user.totalMined ?? 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Purchased ECHO
            </div>
            <div className="text-lg font-black text-white mt-2">
              {Number(state.user.totalPurchased ?? 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Purchase Multiplier
            </div>
            <div className="text-lg font-black text-emerald-300 mt-2">
              {Number(state.user.purchaseMultiplier ?? 1).toFixed(2)}x
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STORE_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-white">{pkg.name}</div>
                  <div className="text-xs text-white/40 mt-1">{pkg.description}</div>
                </div>

                {pkg.badge ? (
                  <div className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-white/70 font-black uppercase tracking-widest">
                    {pkg.badge}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="text-3xl font-black text-white">
                  +{pkg.echoAmount.toLocaleString()} ECHO
                </div>
                <div className="text-sm text-teal-300 font-black">
                  {pkg.solAmount} SOL
                </div>
              </div>

              <button
                onClick={() => handleBuy(pkg.id)}
                disabled={busyPackageId === pkg.id}
                className="w-full h-12 rounded-2xl bg-white text-slate-950 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition disabled:opacity-50"
              >
                {busyPackageId === pkg.id ? "Processing..." : "Buy with SOL"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Wallet className="w-4 h-4 text-white/60" />
          <div className="text-xs font-black text-white/60 uppercase tracking-widest">
            Referral Foundation
          </div>
        </div>

        <div className="text-sm text-white/60">
          Your referral multiplier currently contributes{" "}
          <span className="font-black text-white">
            {Number(state.user.referralMultiplier ?? 1).toFixed(2)}x
          </span>
          .
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