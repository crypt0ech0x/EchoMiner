"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tab } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

// This matches the JSON you showed from /api/state
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null;
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null; // ISO
    lastAccruedAt: string | null; // ISO
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

export default function EchoMinerApp() {
  const [state, setState] = useState<ApiState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Prevent overlapping refresh calls
  const refreshingRef = useRef(false);

  async function loadStateOnce() {
    setLoadError(null);
    try {
      const s = (await EchoAPI.getState()) as ApiState;
      // Basic sanity check so we don't crash on unexpected shapes
      if (!s || typeof s !== "object" || typeof (s as any).ok !== "boolean") {
        throw new Error("Bad state response from server");
      }
      setState(s);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load state");
      setState(null);
    } finally {
      setIsLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadStateOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Refresh from server once per second (safe)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;

      try {
        const updated = (await EchoAPI.refreshState()) as ApiState;
        if (updated && typeof updated.ok === "boolean") {
          setState(updated);
        }
      } catch {
        // Don’t hard-crash the UI if refresh fails intermittently.
        // We keep the last good state.
      } finally {
        refreshingRef.current = false;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;
    if (!state.session.startedAt) return 0;

    const startedMs = Date.parse(state.session.startedAt);
    if (!Number.isFinite(startedMs)) return 0;

    // 3 hour session cap (same as your backend)
    const SESSION_SECONDS = 60 * 60 * 3;

    const elapsedSec = Math.max(0, Math.floor((currentTime - startedMs) / 1000));
    const cappedSec = Math.min(elapsedSec, SESSION_SECONDS);

    const ratePerSec = ((state.session.baseRatePerHr || 0) * (state.session.multiplier || 1)) / 3600;
    const earned = cappedSec * ratePerSec;

    return earned;
  }, [state, currentTime]);

  if (isLoading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center font-black tracking-widest text-white/20 animate-pulse">
        Initializing Voyager Node...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen bg-background flex items-center justify-center px-8">
        <div className="max-w-md w-full glass rounded-2xl p-6 border border-white/10 text-center space-y-4">
          <div className="text-white font-black text-lg">Couldn’t load the app</div>
          <div className="text-xs text-slate-400 break-words">{loadError}</div>
          <button
            onClick={() => {
              setIsLoading(true);
              loadStateOnce();
            }}
            className="w-full h-12 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-black uppercase tracking-widest text-xs"
          >
            Retry
          </button>
          <div className="text-[11px] text-slate-500">
            Tip (iPhone): open this in Safari, then pull-to-refresh once.
          </div>
        </div>
      </div>
    );
  }

  // At this point state should exist, but keep it defensive anyway:
  if (!state) {
    return (
      <div className="h-screen bg-background flex items-center justify-center font-black tracking-widest text-white/20">
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
        // Layout expects "state" — if its type is stricter, you may need to update AppState in lib/types too.
        state={state as any}
      >
        {activeTab === Tab.MINE && (
          <MineTab
            state={state as any}
            sessionEarnings={sessionEarnings}
            onStartSession={async () => setState((await EchoAPI.startSession()) as any)}
            totalMultiplier={state.session.isActive ? state.session.multiplier : 1}
            effectiveRate={(state.session.baseRatePerHr * state.session.multiplier) / 3600}
            currentTime={currentTime}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state as any}
            onApplyAdBoost={async () => setState((await EchoAPI.activateAdBoost()) as any)}
            currentTime={currentTime}
          />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state as any} onPurchase={setState as any} />}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user?.totalMinedEcho ?? 0}
            verifiedWalletAddress={state.wallet?.verified ? state.wallet.address : null}
          />
        )}
      </Layout>

      <ProfileDrawer
        isOpen={isProfileOpen || isNotificationsOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setIsNotificationsOpen(false);
        }}
        state={state as any}
        onUpdateUser={setState as any}
        initialView={isNotificationsOpen ? "notifications" : "main"}
      />
    </div>
  );
}