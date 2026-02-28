// app/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, ApiState, Tab } from "@/lib/types";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

const STORAGE_KEY = "echo_miner_state_v1";

// --- helpers ---
function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function defaultState(): AppState {
  return {
    authed: false,
    wallet: { address: null, verified: false, verifiedAt: null },

    user: {
      id: "guest",
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: Date.now(),
      guest: true,
      riskScore: 0,
      referralCode: "ECHO-VOID",
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
    },

    streak: {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    session: {
      id: "session",
      isActive: false,
      startTime: null,
      endTime: null,

      baseRate: 0,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: 0,

      status: "ended",

      sessionMined: 0,
      lastAccruedAt: null,
    },

    activeBoosts: [],
    ledger: [],
    purchaseHistory: [],
    notifications: [],

    walletAddress: null,
    walletVerifiedAt: null,
    currentNonce: null,
  };
}

/**
 * ✅ Normalize server state into the UI AppState shape that MineTab expects.
 * We keep the previous UI state for fields the server doesn't provide (username, pfp, etc).
 */
function apiToAppState(api: ApiState, prev: AppState | null): AppState {
  const base = prev ?? defaultState();

  const startedAtMs = isoToMs(api.session?.startedAt);
  const endsAtMs =
    api.endsAt != null ? isoToMs(api.endsAt) : startedAtMs != null ? startedAtMs + 3 * 60 * 60 * 1000 : null;

  const lastAccruedAtMs = isoToMs(api.session?.lastAccruedAt);

  const baseRatePerSec = (api.session?.baseRatePerHr ?? 0) / 3600;
  const multiplier = api.session?.multiplier ?? 1;
  const effectiveRatePerSec = baseRatePerSec * multiplier;

  const sessionMined = api.session?.sessionMined ?? 0;
  const totalMinedEcho = api.user?.totalMinedEcho ?? 0;

  return {
    ...base,

    authed: !!api.authed,
    wallet: {
      address: api.wallet?.address ?? null,
      verified: !!api.wallet?.verified,
      verifiedAt: api.wallet?.verifiedAt ?? null,
    },

    // keep compatibility fields (older code still uses these)
    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: api.wallet?.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,

    user: {
      ...base.user,
      balance: totalMinedEcho,
      totalMined: totalMinedEcho,
      guest: !api.authed,
    },

    session: {
      ...base.session,
      isActive: !!api.session?.isActive,
      startTime: startedAtMs,
      endTime: endsAtMs,

      baseRate: baseRatePerSec,
      effectiveRate: effectiveRatePerSec,

      // keep these at 1 unless you later wire streak/boost/purchase multipliers from server
      streakMultiplier: base.session.streakMultiplier ?? 1,
      boostMultiplier: base.session.boostMultiplier ?? 1,
      purchaseMultiplier: base.session.purchaseMultiplier ?? 1,

      status: api.session?.isActive ? "active" : "ended",

      sessionMined,
      lastAccruedAt: lastAccruedAtMs,
      id: base.session.id || "session",
    },
  };
}

async function fetchApiState(url: string, init?: RequestInit): Promise<ApiState> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  const data = (await res.json()) as ApiState;
  // light validation
  if (!data || typeof data !== "object" || typeof (data as any).ok !== "boolean") {
    throw new Error("Bad response from server");
  }
  return data;
}

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const refreshTimer = useRef<number | null>(null);

  // initial load (use local as base, then hydrate from server)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadError(null);

        const prev = typeof window !== "undefined" ? safeJsonParse<AppState>(localStorage.getItem(STORAGE_KEY)) : null;

        const api = await fetchApiState("/api/state", { method: "GET" });
        const next = apiToAppState(api, prev);

        if (!mounted) return;
        setState(next);

        if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

        // if not authed, take them to wallet
        if (!api.authed) setActiveTab(Tab.WALLET);
      } catch (e: any) {
        if (!mounted) return;
        setLoadError(e?.message || "Failed to load state");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // clock tick for animation
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  // refresh loop (only really needed when session is active)
  useEffect(() => {
    if (!state) return;

    if (refreshTimer.current) window.clearInterval(refreshTimer.current);

    refreshTimer.current = window.setInterval(async () => {
      try {
        if (!state.session.isActive) return;

        const prev = state;
        const api = await fetchApiState("/api/mining/refresh", { method: "POST" });
        const next = apiToAppState(api, prev);

        setState(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore refresh errors
      }
    }, 2000);

    return () => {
      if (refreshTimer.current) window.clearInterval(refreshTimer.current);
    };
  }, [state?.session?.isActive]); // important: only restart when active changes

  const sessionEarnings = useMemo(() => {
    if (!state?.session.isActive) return 0;

    // ✅ server truth
    const base = state.session.sessionMined ?? 0;

    // ✅ live “smooth” accrual since lastAccruedAt (so it visibly increases between refreshes)
    const last = state.session.lastAccruedAt ?? state.session.startTime ?? nowMs;
    const end = state.session.endTime ?? nowMs;

    const effectiveNow = Math.min(nowMs, end);
    const deltaSec = Math.max(0, (effectiveNow - last) / 1000);

    const live = deltaSec * (state.session.effectiveRate ?? 0);

    return base + live;
  }, [state, nowMs]);

  const totalMultiplier = useMemo(() => {
    if (!state) return 1;
    const base = state.session.baseRate || 0;
    const eff = state.session.effectiveRate || 0;
    if (base <= 0) return 1;
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
              const prev =
                typeof window !== "undefined"
                  ? safeJsonParse<AppState>(localStorage.getItem(STORAGE_KEY))
                  : null;

              const api = await fetchApiState("/api/state", { method: "GET" });
              const next = apiToAppState(api, prev);

              setState(next);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              if (!api.authed) setActiveTab(Tab.WALLET);
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
            effectiveRate={state.session.effectiveRate}
            totalMultiplier={totalMultiplier}
            currentTime={nowMs}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
            onStartSession={async () => {
              const api = await fetchApiState("/api/mining/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ baseRatePerHr: 1, multiplier: 1 }),
              });

              const next = apiToAppState(api, state);
              setState(next);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            }}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab state={state} onApplyAdBoost={async () => state} currentTime={nowMs} />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state} onPurchase={setState} />}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user.totalMined}
            verifiedWalletAddress={state.wallet.address}
            onVerified={async () => {
              const api = await fetchApiState("/api/state", { method: "GET" });
              const next = apiToAppState(api, state);
              setState(next);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
        onUpdateUser={(s) => {
          setState(s);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        }}
        initialView={isNotificationsOpen ? "notifications" : "main"}
      />
    </div>
  );
}