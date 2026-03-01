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

  const [now, setNow] = useState(Date.now());

  // initial load
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadError(null);
        const s = await EchoAPI.getState();
        if (!mounted) return;
        setState(s);

        // If not authed or wallet not verified, make Wallet tab obvious
        if (!s.authed || !s.wallet?.verified) setActiveTab(Tab.WALLET);
      } catch (e: any) {
        if (!mounted) return;
        setLoadError(e?.message || "Failed to load state");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // tick for smooth UI animation
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // refresh server accrual while active
  useEffect(() => {
    if (!state) return;

    const interval = setInterval(async () => {
      try {
        if (state.session?.isActive) {
          const updated = await EchoAPI.refreshState();
          setState(updated);
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [state?.session?.isActive]);

  // ✅ Smooth earnings for MineTab:
  // server sessionMined + time since lastAccruedAt * effectiveRate
  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;

    const base = Number(state.session.sessionMined ?? 0);
    const last = state.session.lastAccruedAt ? Number(state.session.lastAccruedAt) : null;
    if (!last) return base;

    const deltaSec = Math.max(0, (now - last) / 1000);
    const rate = Number(state.session.effectiveRate ?? 0); // per second
    return base + deltaSec * rate;
  }, [state, now]);

  const effectiveRate = useMemo(() => Number(state?.session?.effectiveRate ?? 0), [state]);

  const totalMultiplier = useMemo(() => {
    const base = Number(state?.session?.baseRate ?? 0);
    if (!base) return 1;
    return effectiveRate / base;
  }, [state, effectiveRate]);

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
              if (!s.authed || !s.wallet?.verified) setActiveTab(Tab.WALLET);
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
            onStartSession={async () => setState(await EchoAPI.startSession())}
            totalMultiplier={totalMultiplier}
            effectiveRate={effectiveRate}
            currentTime={now}
            onOpenBoosts={() => setActiveTab(Tab.BOOST)}
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
            verifiedWalletAddress={state.wallet?.verified ? state.wallet.address : null}
            onVerified={async () => setState(await EchoAPI.getState())}
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