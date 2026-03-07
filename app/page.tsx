// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Tab } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

export default function EchoMinerApp() {
  const { publicKey, connected } = useWallet();

  const [state, setState] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [now, setNow] = useState(() => Date.now());

  const connectedWalletAddress = connected && publicKey ? publicKey.toBase58() : null;
  const serverWalletAddress = state?.wallet?.address ?? null;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      if (connected && publicKey) {
        sessionStorage.setItem("connected_wallet_address", publicKey.toBase58());
      } else {
        sessionStorage.removeItem("connected_wallet_address");
      }
    } catch {
      // ignore
    }
  }, [connected, publicKey]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadError(null);
        const s = await EchoAPI.getState();
        if (!mounted) return;
        setState(s);

        if (!s.authed) {
          setActiveTab(Tab.WALLET);
        }
      } catch (e: any) {
        if (!mounted) return;
        setLoadError(e?.message || "Failed to load state");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!state?.session?.isActive) return;

    const interval = setInterval(async () => {
      try {
        const updated = await EchoAPI.refreshState();
        setState(updated);
      } catch {
        // ignore transient refresh errors
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [state?.session?.isActive]);

  const effectiveRatePerSec = useMemo(() => {
    return Number(state?.session?.effectiveRate ?? 0);
  }, [state]);

  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;

    const base = Number(state.session.sessionMined ?? 0);
    const lastAccruedAt = state.session.lastAccruedAt ?? null;

    if (!lastAccruedAt) return base;
    if (!Number.isFinite(effectiveRatePerSec) || effectiveRatePerSec <= 0) return base;

    const deltaSec = Math.max(0, (now - lastAccruedAt) / 1000);
    return base + deltaSec * effectiveRatePerSec;
  }, [state, now, effectiveRatePerSec]);

  const totalMultiplier = useMemo(() => {
    if (!state?.session) return 1;
    const base = Number(state.session.baseRate ?? 0);
    const eff = Number(state.session.effectiveRate ?? 0);
    if (!base || base <= 0) return 1;
    return eff / base;
  }, [state]);

  if (loadError) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center p-8">
        <div className="text-white/70 font-black tracking-widest mb-3">
          Couldn’t load
        </div>
        <div className="text-white/40 text-sm mb-6">{loadError}</div>
        <button
          className="px-5 py-3 rounded-xl bg-white/10 text-white font-bold"
          onClick={async () => {
            try {
              setLoadError(null);
              const s = await EchoAPI.getState();
              setState(s);
              if (!s.authed) setActiveTab(Tab.WALLET);
            } catch (e: any) {
              setLoadError(e?.message || "Failed to load state");
            }
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-screen bg-background flex items-center justify-center font-black tracking-widest text-white/20 animate-pulse">
        Initializing Voyager Node...
      </div>
    );
  }

  const walletMismatch =
    !!connectedWalletAddress &&
    !!serverWalletAddress &&
    connectedWalletAddress !== serverWalletAddress;

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-background">
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full" />
      <div className="absolute top-1/2 -right-24 w-64 h-64 bg-teal-600/10 blur-[100px] rounded-full" />

      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        state={state}
      >
        <div className="px-4 pt-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <div>Connected wallet: {connectedWalletAddress ?? "none"}</div>
            <div>Server wallet: {serverWalletAddress ?? "none"}</div>
            <div>Authed: {String(!!state?.authed)}</div>
            <div>Wallet mismatch: {String(walletMismatch)}</div>
          </div>

          {actionError && (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {actionError}
            </div>
          )}
        </div>

        {activeTab === Tab.MINE && (
          <MineTab
            state={state}
            sessionEarnings={sessionEarnings}
            effectiveRate={effectiveRatePerSec}
            totalMultiplier={totalMultiplier}
            currentTime={now}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
            onStartSession={async () => {
              setActionError(null);

              try {
                const updated = await EchoAPI.startSession();
                setState(updated);
              } catch (e: any) {
                const msg =
                  e?.data?.error ||
                  e?.message ||
                  "Start session failed";

                const details = [
                  `Error: ${msg}`,
                  `HTTP status: ${String(e?.status ?? "unknown")}`,
                  `Connected wallet: ${connectedWalletAddress ?? "none"}`,
                  `Server wallet: ${serverWalletAddress ?? "none"}`,
                ];

                if (e?.data?.requestedWalletAddress || e?.data?.serverWalletAddress) {
                  details.push(
                    `Requested wallet: ${e?.data?.requestedWalletAddress ?? "none"}`
                  );
                  details.push(
                    `Server wallet from API: ${e?.data?.serverWalletAddress ?? "none"}`
                  );
                }

                setActionError(details.join(" | "));
                console.error("start session failed:", e);
              }
            }}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => {
              const updated = await EchoAPI.activateAdBoost();
              setState(updated);
            }}
            currentTime={now}
          />
        )}

        {activeTab === Tab.STORE && (
          <StoreTab
            state={state}
            onPurchase={setState}
          />
        )}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user.totalMined}
            walletFromServer={{
              address: state.wallet?.address ?? null,
              verified: !!state.wallet?.verified,
              verifiedAt: state.wallet?.verifiedAt ?? null,
            }}
            onVerified={async () => {
              const fresh = await EchoAPI.getState();
              setState(fresh);
              setActionError(null);
            }}
          />
        )}
      </Layout>

      <ProfileDrawer
        isOpen={isProfileOpen || isNotificationsOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setIsNotificationsOpen(false);
        }}
        state={state}
        onUpdateUser={setState}
        initialView={isNotificationsOpen ? "notifications" : "main"}
      />
    </div>
  );
}