// components/StoreTab.tsx
"use client";

import React, { useState } from "react";
import { AppState } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import { STORE_PACKAGES } from "@/lib/store-packages";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

type Props = {
  state: AppState;
  onPurchase: (state: AppState) => void;
};

export default function StoreTab({ state, onPurchase }: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleBuy(packageId: string) {
    try {
      setErr(null);
      setSuccess(null);
      setBusyId(packageId);

      if (!connected || !publicKey || !sendTransaction) {
        throw new Error("Connect your wallet first.");
      }

      const intent = await EchoAPI.createStoreIntent(packageId);

      const treasuryWallet = new PublicKey(intent.treasuryWallet);
      const lamports = Number(intent.lamports);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryWallet,
          lamports,
        })
      );

      const signature = await sendTransaction(tx, connection as Connection);
      await connection.confirmTransaction(signature, "finalized");

      const updated = await EchoAPI.confirmStorePurchase(
        intent.purchaseId,
        signature
      );

      onPurchase(updated);
      setSuccess(`Purchase confirmed: ${intent.package.echoAmount} ECHO added.`);
    } catch (e: any) {
      setErr(e?.message || "Purchase failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h2 className="text-lg font-black text-white tracking-tight">Store</h2>
        <p className="text-xs text-white/40 font-bold mt-1">
          Buy ECHO with SOL to grow your balance faster.
        </p>
      </div>

      <div className="grid gap-4">
        {STORE_PACKAGES.map((pkg) => (
          <div
            key={pkg.id}
            className="glass rounded-2xl border border-white/10 p-5 flex items-center justify-between gap-4"
          >
            <div>
              <div className="text-sm font-black text-white">{pkg.name}</div>
              <div className="text-xs text-white/45 mt-1">{pkg.description}</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="text-lg font-black text-white">
                  {pkg.solAmount.toFixed(2)} SOL
                </div>
                <div className="text-xs text-white/30">→</div>
                <div className="text-lg font-black text-emerald-300">
                  +{pkg.echoAmount} ECHO
                </div>
              </div>
            </div>

            <button
              onClick={() => handleBuy(pkg.id)}
              disabled={busyId === pkg.id}
              className="px-5 py-3 rounded-2xl bg-white text-slate-950 font-black text-xs uppercase tracking-widest disabled:opacity-50"
            >
              {busyId === pkg.id ? "Processing..." : "Buy with SOL"}
            </button>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">
          Purchased ECHO
        </div>
        <div className="mt-2 text-2xl font-black text-white">
          {Number((state.user as any).totalPurchased ?? 0).toFixed(2)}
        </div>
      </div>

      {success && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200 text-sm font-bold">
          {success}
        </div>
      )}

      {err && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200 text-sm font-bold">
          {err}
        </div>
      )}
    </div>
  );
}