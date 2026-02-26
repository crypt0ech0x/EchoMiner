"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tab, AppState } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

function getVerifiedWalletAddress(state: AppState | null): string | null {
  if (!state) return null;

  // Prefer the new server shape: state.wallet.{address, verified}
  const w = (state as any).wallet;
  if (w && typeof w === "object") {
    const addr = typeof w.address === "string" ? w.address : null;
    const verified = Boolean(w.verified);
    return verified && addr ? addr : null;
  }

  // Fallback to older shape if your AppState still has walletAddress
  const legacy = (state as any).walletAddress;
  return typeof legacy === "string" && legacy.length ? legacy : null;
}

function getTotalMined(state: AppState | null): number {
  if (!state) return 0;

  // Your TS errors show UserStats has totalMined (not totalMinedEcho)
  const user = (state as any).user;
  const v = user?.totalMined;
  return Number.isFinite(v) ? Number(v) : 0;
}

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  async function loadInitialState() {
    setLoadError(null);
    try {
      const s = await EchoAPI.getState(); // should already return AppState
      if (!mountedRef.current) return;
      setState(s);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setLoadError(e?.message || "Failed to load state");
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    loadInitialState();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh loop (don’t spam if state is null)
  useEffect(() => {
    if (!state) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        // Optional: only refresh if mining is active (reduces load)
        const isActive = Boolean((state as any)?.session?.isActive);

        // If you want ALWAYS refresh, remove this if-block.
        if (!isActive) return;

        const updated = await EchoAPI.refreshState();
        if (cancelled || !mountedRef.current) return;
        setState(updated);
        setRefreshError(null);
      } catch (e: any) {
        if (cancelled || !mountedRef.current) return;
        // Don’t crash UI on iPhone—just show a small retry hint
        setRefreshError(e?.message || "Refresh failed");
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state]);

  // Session earnings: don’t rely on strict fields; use “maybe” fields safely.
  const sessionEarnings = useMemo(() => {
    if (!state) return 0;
    const s: any = (state as any).session;

    // If your state now stores mined in sessionMined, use it:
    if (typeof s?.sessionMined === "number") return s.sessionMined;

    // Legacy client-calc fallback:
    if (!s?.isActive) return 0;
    const start = typeof s?.startTime === "number" ? s.startTime : null;
    const rate = typeof s?.effectiveRate === "number" ? s.effectiveRate : null;
    if (start == null || rate == null) return 0;

    const elapsedSec = (Date.now() - start) / 1000;
    return Math.max(0, elapsedSec * rate);
  }, [state]);

  if (loadError) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center px-6">
        <div className="font-black tracking-widest text-white/60 mb-2">Couldn’t load</div>
        <div className="text-xs text-white/40 mb-6 break-words">{loadError}</div>
        <button
          onClick={loadInitialState}
          className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold"
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

  const totalMined = getTotalMined(state);
  const verifiedWalletAddress = getVerifiedWalletAddress(state);

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
        {refreshError && (
          <div className="mx-6 mb-4 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-200 text-xs font-bold">
            {refreshError} (will keep trying)
          </div>
        )}

        {activeTab === Tab.MINE && (
          <MineTab
            state={state}
            sessionEarnings={sessionEarnings}
            onStartSession={async () => setState(await EchoAPI.startSession())}
            totalMultiplier={
              (state as any)?.session?.isActive
                ? (((state as any).session.effectiveRate ?? 0) / ((state as any).session.baseRate ?? 1) || 1)
                : 1
            }
            effectiveRate={(state as any)?.session?.effectiveRate ?? 0}
            currentTime={Date.now()}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => setState(await EchoAPI.activateAdBoost())}
            currentTime={Date.now()}
          />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state} onPurchase={setState} />}

        {activeTab === Tab.WALLET && (
          <WalletTab totalMinedEcho={totalMined} verifiedWalletAddress={verifiedWalletAddress} />
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