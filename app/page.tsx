"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tab } from "@/lib/types";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

// Minimal shape based on what your /api/state returns.
// (Keeps you independent of EchoAPI URL/env weirdness.)
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
    startedAt: string | null;
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

async function fetchState(): Promise<ApiState> {
  const res = await fetch("/api/state", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`State fetch failed (${res.status})`);
  return (await res.json()) as ApiState;
}

async function postRefresh(): Promise<ApiState> {
  const res = await fetch("/api/mining/refresh", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    // If user isn’t authed, or wallet not verified, don’t hard-crash the UI.
    // Just fall back to GET /api/state.
    return await fetchState();
  }
  // Your refresh route likely returns mining fields; but easiest is:
  // after refresh, read canonical state.
  return await fetchState();
}

export default function EchoMinerApp() {
  const [state, setState] = useState<ApiState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keep a live ref so intervals don’t close over stale state
  const stateRef = useRef<ApiState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 1) Initial load (with retry)
  useEffect(() => {
    let cancelled = false;

    async function loadWithRetry() {
      setLoadError(null);

      const delays = [0, 500, 1500, 3000]; // quick retries
      for (const d of delays) {
        if (cancelled) return;
        if (d) await new Promise((r) => setTimeout(r, d));

        try {
          const s = await fetchState();
          if (cancelled) return;
          setState(s);
          return;
        } catch (e: any) {
          if (cancelled) return;
          setLoadError(e?.message || "Failed to load state");
        }
      }
    }

    loadWithRetry();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Tick clock for UI
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 3) Refresh/poll:
  // - If mining is active, refresh every 1s
  // - If not active, refresh every 10s (keeps wallet/session status current)
  useEffect(() => {
    let cancelled = false;

    async function loop() {
      while (!cancelled) {
        const s = stateRef.current;
        const active = Boolean(s?.session?.isActive);

        // Wait
        const delay = active ? 1000 : 10000;
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;

        try {
          const updated = active ? await postRefresh() : await fetchState();
          if (cancelled) return;
          setState(updated);
          setLoadError(null);
        } catch (e: any) {
          if (cancelled) return;
          setLoadError(e?.message || "Refresh failed");
        }
      }
    }

    loop();
    return () => {
      cancelled = true;
    };
  }, []);

  // If your MineTab still expects “session earnings”, just use server truth:
  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;
    return Number(state.session.sessionMined || 0);
  }, [state]);

  // Simple derived numbers (safe even if components don’t use them)
  const totalMultiplier = useMemo(() => {
    if (!state?.session) return 1;
    return Number(state.session.multiplier || 1);
  }, [state]);

  const effectiveRatePerSec = useMemo(() => {
    if (!state?.session) return 0;
    const perHr = Number(state.session.baseRatePerHr || 0) * Number(state.session.multiplier || 1);
    return perHr / 3600;
  }, [state]);

  if (!state) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center gap-3 font-black tracking-widest text-white/20 animate-pulse">
        <div>Initializing Voyager Node...</div>
        {loadError ? (
          <div className="text-xs font-bold tracking-normal text-red-400/80 animate-none">
            {loadError} — retrying…
          </div>
        ) : null}
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
        // If Layout expects your old AppState type, keep passing what it needs.
        // Most layouts only read user/session/wallet-ish fields anyway.
        state={state as any}
      >
        {activeTab === Tab.MINE && (
          <MineTab
            state={state as any}
            sessionEarnings={sessionEarnings}
            onStartSession={async () => {
              // If your MineTab start button calls an API internally, you can ignore this.
              // Otherwise, you likely have /api/mining/start — after calling it, re-fetch state:
              await fetch("/api/mining/start", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  baseRatePerHr: state.session.baseRatePerHr || 1,
                  multiplier: state.session.multiplier || 1,
                }),
              }).catch(() => null);
              setState(await fetchState());
            }}
            totalMultiplier={totalMultiplier}
            effectiveRate={effectiveRatePerSec}
            currentTime={currentTime}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state as any}
            onApplyAdBoost={async () => {
              await fetch("/api/boost/activate", { method: "POST", credentials: "include" }).catch(() => null);
              setState(await fetchState());
            }}
            currentTime={currentTime}
          />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state as any} onPurchase={() => fetchState().then(setState)} />}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user.totalMinedEcho}
            verifiedWalletAddress={state.wallet.verified ? state.wallet.address : null}
          />
        )}

        {loadError ? (
          <div className="mt-3 text-center text-xs font-bold text-red-400/80">
            {loadError}
          </div>
        ) : null}
      </Layout>

      <ProfileDrawer
        isOpen={isProfileOpen || isNotificationsOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setIsNotificationsOpen(false);
        }}
        state={state as any}
        onUpdateUser={() => fetchState().then(setState)}
        initialView={isNotificationsOpen ? "notifications" : "main"}
      />
    </div>
  );
}