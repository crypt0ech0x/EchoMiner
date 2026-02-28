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

  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // 1) Initial load
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadError(null);
        const s = await EchoAPI.getState();
        if (!mounted) return;

        setState(s);

        // If wallet not verified yet, push user to Wallet tab
        if (!s.walletAddress || !s.walletVerifiedAt) {
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

  // 2) UI clock tick (drives MineTab timers + animation)
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 3) Refresh mining session periodically (server accrual)
  useEffect(() => {
    if (!state) return;

    const t = setInterval(async () => {
      try {
        // Only refresh frequently while active
        if (state.session?.isActive) {
          const updated = await EchoAPI.refreshState();
          setState(updated);
        }
      } catch {
        // Ignore refresh errors (don’t white-screen)
      }
    }, 2000);

    return () => clearInterval(t);
  }, [state?.session?.isActive]);

  // 4) Compute session earnings for display while mining
  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;
    if (!state.session.startTime) return 0;

    const elapsedSec = Math.max(0, (currentTime - state.session.startTime) / 1000);

    // effectiveRate is ECHO per second (based on your MineTab usage: effectiveRate * 3600 = E/H)
    const earned = elapsedSec * state.session.effectiveRate;

    // If you want to clamp to session length, do it via endTime if present
    if (state.session.endTime) {
      const maxSec = Math.max(0, (state.session.endTime - state.session.startTime) / 1000);
      return Math.min(earned, maxSec * state.session.effectiveRate);
    }

    return earned;
  }, [state, currentTime]);

  // If state failed to load
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

              if (!s.walletAddress || !s.walletVerifiedAt) {
                setActiveTab(Tab.WALLET);
              }
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

  // Loading skeleton
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
              const updated = await EchoAPI.startSession();
              setState(updated);
            }}
            totalMultiplier={
              state.session?.baseRate > 0 ? state.session.effectiveRate / state.session.baseRate : 1
            }
            effectiveRate={state.session.effectiveRate}
            currentTime={currentTime}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
          />
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => {
              const updated = await EchoAPI.activateAdBoost();
              setState(updated);
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