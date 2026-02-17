"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function WalletStatus() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [sol, setSol] = useState<number | null>(null);

  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);

  useEffect(() => {
    let cancelled = false;

    async function fetchBalance(pk: PublicKey) {
      const lamports = await connection.getBalance(pk, { commitment: "confirmed" });
      if (!cancelled) setSol(lamports / LAMPORTS_PER_SOL);
    }

    setSol(null);
    if (publicKey) fetchBalance(publicKey);

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  if (!connected) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/60">Connected Wallet</div>
      <div className="mt-1 font-mono text-sm text-white break-all">{address}</div>
      <div className="mt-3 text-sm text-white/80">
        SOL Balance: {sol === null ? "Loading…" : sol.toFixed(4)}
      </div>
    </div>
  );
}
