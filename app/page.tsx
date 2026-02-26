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

/**
 * This matches the REAL response shape from /api/state
 * (you showed: { ok, authed, wallet, user, session })
 */
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

function toAppState(api: ApiState): AppState {
  const startMs = api.session.startedAt ? Date.parse(api.session.startedAt) : null;

  // Convert server session rates -> what your MineTab UI expects
  const baseRatePerSec = (api.session.baseRatePerHr || 0) / 3600;
  const effectiveRatePerSec = baseRatePerSec * (api.session.multiplier || 1);

  // Build an AppState that matches what your components already use
  // (keeping your existing field names like state.user.totalMined and state.walletAddress)
  return {
    // --- user ---
    user: {
      ...(({} as any) as AppState["user"]),
      totalMined: api.user.totalMinedEcho ?? 0,
      totalMinedEcho: api.user.totalMinedEcho ?? 0,
    },

    // --- wallet ---
    walletAddress: api.wallet.address,
    wallet: {
      address: api.wallet.address,
      verified: api.wallet.verified,
      verifiedAt: api.wallet.verifiedAt,
    },

    // --- session ---
    session: {
      ...(({} as any) as AppState["session"]),
      isActive: api.session.isActive,
      startTime: startMs ?? undefined, // your old UI used startTime
      startedAt: api.session.startedAt,
      lastAccruedAt: api.session.lastAccruedAt,
      baseRate: baseRatePerSec,
      effectiveRate: effectiveRatePerSec,
      baseRatePerHr: api.session.baseRatePerHr,
      multiplier: api.session.multiplier,
      sessionMined: api.session.sessionMined,
    },

    // --- keep any other fields your Layout/ProfileDrawer expect ---
    ...(({} as any) as Omit<AppState, "user" | "walletAddress" | "wallet" | "session">),
  };
}

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  async function fetchState() {
    setLoadError(null);
    try {
      const raw = (await EchoAPI.getState()) as unknown;

      // Hard-validate minimal shape so iPhone doesn't crash on weird responses
      if (!raw || typeof raw !== "object" || typeof (raw as any).ok !== "boolean") {
        throw new Error("Bad /api/state response");
      }

      const api = raw as ApiState;
      if (!mountedRef.current) return;

      setState(toAppState(api));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setState(null);
      setLoadError(e?.message || "Failed to load state");
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    fetchState();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh loop (fast only when mining is active)
  useEffect(() => {
    const id = setInterval(async () => {
      setCurrentTime(Date.now());

      // If we don't have state yet, don't spam calls
      if (!state) return;

      try {
        // If your EchoAPI.refreshState returns AppState already, keep it.
        // If it returns ApiState, convert it.
        const raw = (await EchoAPI.refreshState()) as unknown;

        // If refreshState returns the same /api/state shape:
        if (raw && typeof raw === "object" && typeof (raw as any).ok === "boolean") {
          setState(toAppState(raw as ApiState));
          return;
        }

        // Otherwise assume refreshState already returns AppState:
        setState(raw as AppState);
      } catch {
        // Don’t nuke UI on transient refresh errors
      }
    }, state?.session?.isActive ? 1000 : 8000);

    return () => clearInterval(id);
  }, [state]);

  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;

    const start = (state.session as any).startTime as number | undefined;
    const effectiveRate = (state.session as any).effectiveRate as number | undefined;

    if (!start || !effectiveRate) return 0;

    const elapsedSec = (currentTime - start) / 1000;
    const maxSec = 60 * 60 * 3; // 3 hours
    return Math.max(0, Math.min(elapsedSec, maxSec) * effectiveRate);
  }, [state, currentTime]);

  if (!state) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center px-6">
        <div className="font-black tracking-widest text-white/20 animate-pulse">
          Initializing Voyager Node...
        </div>

        {loadError && (
          <div className="mt-4 max-w-md w-full text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            {loadError}
            <div className="mt-3">
              <button
                onClick={fetchState}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-black tracking-widest"
              >
                RETRY
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const verifiedWalletAddress =
    state.wallet?.verified && state.wallet?.address ? state.wallet.address : null;

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
            onStartSession={async () => setState(await EchoAPI.startSession())}
            totalMultiplier={state.session.isActive ? (state.session.multiplier ?? 1) : 1}
            effectiveRate={(state.session as any).effectiveRate ?? 0}
            currentTime={currentTime}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => setState(await EchoAPI.activateAdBoost())}
            currentTime={currentTime}
          />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state} onPurchase={setState} />}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={(state.user as any).totalMinedEcho ?? (state.user as any).totalMined ?? 0}
            verifiedWalletAddress={verifiedWalletAddress}
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