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

/**
 * This matches your /api/state response:
 * {"ok":true,"authed":false,"wallet":{"address":null,"verified":false,...},"user":{"totalMinedEcho":0},"session":{...}}
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
  // Convert API -> UI state shape your components expect
  return {
    // keep any other fields your AppState may have (if they exist)
    // if AppState has more required fields, add them here.
    walletAddress: api.wallet.address,
    walletVerified: api.wallet.verified,
    walletVerifiedAt: api.wallet.verifiedAt,

    user: {
      totalMined: api.user.totalMinedEcho ?? 0,
    },

    session: {
      isActive: api.session.isActive,
      startedAt: api.session.startedAt,
      lastAccruedAt: api.session.lastAccruedAt,
      baseRatePerHr: api.session.baseRatePerHr ?? 0,
      multiplier: api.session.multiplier ?? 1,
      sessionMined: api.session.sessionMined ?? 0,
    },
  } as unknown as AppState;
}

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  async function loadState() {
    setLoadError(null);
    try {
      const raw: unknown = await EchoAPI.getState();

      if (!raw || typeof raw !== "object") throw new Error("Bad state response (not an object).");

      const api = raw as Partial<ApiState>;
      if (typeof api.ok !== "boolean" || !api.wallet || !api.user || !api.session) {
        throw new Error("Bad state response (missing fields).");
      }

      setState(toAppState(api as ApiState));
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load state.");
      setState(null);
    }
  }

  useEffect(() => {
    loadState();
  }, []);

  // Refresh loop (calls refresh endpoint if you have one, otherwise just re-load state)
  useEffect(() => {
    const interval = setInterval(async () => {
      setCurrentTime(Date.now());
      try {
        // If your EchoAPI.refreshState() returns the API shape, convert it too.
        const raw: unknown = await EchoAPI.refreshState().catch(() => null);
        if (!raw || typeof raw !== "object") return;

        const api = raw as Partial<ApiState>;
        if (typeof api.ok !== "boolean" || !api.wallet || !api.user || !api.session) return;

        setState(toAppState(api as ApiState));
      } catch {
        // ignore refresh errors, keep UI alive
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // With DB-backed sessions, you can show "session earnings" as sessionMined
  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;
    return state.session.sessionMined ?? 0;
  }, [state]);

  const effectiveRatePerHr = useMemo(() => {
    if (!state) return 0;
    return (state.session.baseRatePerHr ?? 0) * (state.session.multiplier ?? 1);
  }, [state]);

  const totalMultiplier = useMemo(() => {
    if (!state?.session?.isActive) return 1;
    return state.session.multiplier ?? 1;
  }, [state]);

  if (loadError) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col items-center justify-center text-center p-8">
        <div className="text-white font-black tracking-widest mb-3">Couldn’t load app state</div>
        <div className="text-white/50 text-sm mb-6 break-words max-w-[28rem]">{loadError}</div>
        <button
          onClick={loadState}
          className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold border border-white/10"
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
            onStartSession={async () => {
              const raw: unknown = await EchoAPI.startSession();
              if (raw && typeof raw === "object") {
                const api = raw as Partial<ApiState>;
                if (typeof api.ok === "boolean" && api.wallet && api.user && api.session) {
                  setState(toAppState(api as ApiState));
                  return;
                }
              }
              // fallback: re-load state
              await loadState();
            }}
            totalMultiplier={totalMultiplier}
            effectiveRate={effectiveRatePerHr}
            currentTime={currentTime}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => {
              const raw: unknown = await EchoAPI.activateAdBoost();
              if (raw && typeof raw === "object") {
                const api = raw as Partial<ApiState>;
                if (typeof api.ok === "boolean" && api.wallet && api.user && api.session) {
                  setState(toAppState(api as ApiState));
                  return;
                }
              }
              await loadState();
            }}
            currentTime={currentTime}
          />
        )}

        {activeTab === Tab.STORE && <StoreTab state={state} onPurchase={setState} />}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user.totalMined}
            verifiedWalletAddress={state.walletAddress ?? null}
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