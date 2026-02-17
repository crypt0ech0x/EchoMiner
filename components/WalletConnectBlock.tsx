"use client";

import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnectBlock() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-white/80">
        Connect a Solana wallet to receive your ECHO airdrop at launch.
      </div>
      <WalletMultiButton />
    </div>
  );
}
