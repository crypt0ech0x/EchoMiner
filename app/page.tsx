// app/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Tab, AppState } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Initial load
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadError(null);
        const s = await EchoAPI.getState();
        if (!mounted) return;
        setState(s);

        // If not authed, put them on wallet tab so they connect/verify
        if (!s.authed) setActiveTab(Tab.WALLET);
      } catch (e: any) {
        if (!mounted) return;
        setLoadError(e?.message || "Failed to load state");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Keep a "now" clock for UI animations / countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Refresh server state periodically while mining is active
  useEffect(() => {
    if (!state) return;

    const interval = setInterval(async () => {
      try {
        if (state.session?.isActive) {
          const updated = await EchoAPI.refreshState();
          setState(updated);
        }
      } catch {
        // ignore (don’t crash UI)
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [state?.session?.isActive]);

  /**
   * IMPORTANT:
   * - sessionMined is server-truth
   * - lastAccruedAt is when server last updated it
   * - We “smooth” the display locally so it increments on screen between refreshes
   */
  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;

    const base = Number(state.session.sessionMined ?? 0);

    const la = state.session.lastAccruedAt;
    if (!la) return base;

    const lastMs =
      typeof la === "number"
        ? la
        : typeof la === "string"
          ? new Date(la).getTime()
          : NaN;

    if (!Number.isFinite(lastMs)) return base;

    // effectiveRate is PER SECOND in your UI
    const effectiveRatePerSec = Number(state.session.effectiveRate ?? 0);
    const deltaSec = Math.max(0, (now - lastMs) / 1000);

    return base + deltaSec * effectiveRatePerSec;
  }, [state?.session?.isActive, state?.session?.sessionMined, state?.session?.lastAccruedAt, state?.session?.effectiveRate, now]);

  // Helpers for MineTab props
  const effectiveRatePerSec = useMemo(() => Number(state?.session?.effectiveRate ?? 0), [state]);
  const totalMultiplier = useMemo(() => {
    const base = Number(state?.session?.baseRate ?? 0);
    const eff = Number(state?.session?.effectiveRate ?? 0);
    if (!base || !Number.isFinite(base)) return 1;
    return eff / base;
  }, [state]);

  if (loadError) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center p-8">
        <div className="text-white/70 font-black tracking-widest mb-3">Couldn’t load</div>
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
        {activeTab === Tab.MINE && (
          <MineTab
            state={state}
            sessionEarnings={sessionEarnings}
            effectiveRate={effectiveRatePerSec}
            totalMultiplier={totalMultiplier}
            currentTime={now}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
            onStartSession={async () => {
              // IMPORTANT: Your start route expects baseRatePerHr + multiplier.
              // If your EchoAPI.startSession already sends those, fine.
              // If not, we just call it and then refresh state.
              const updated = await EchoAPI.startSession();
              setState(updated);
            }}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => setState(await EchoAPI.activateAdBoost())}
            currentTime={now}
          />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state} onPurchase={setState} />}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user.totalMined}
            verifiedWalletAddress={state.wallet?.address ?? state.walletAddress ?? null}
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