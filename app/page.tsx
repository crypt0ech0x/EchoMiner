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

function toMs(d: any): number | null {
  if (!d) return null;
  const t = typeof d === "string" ? Date.parse(d) : d instanceof Date ? d.getTime() : null;
  return Number.isFinite(t as number) ? (t as number) : null;
}

const SESSION_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const [bootError, setBootError] = useState<string | null>(null);
  const bootedOnceRef = useRef(false);

  // ---- Load state (never get stuck on "Initializing..." forever) ----
  async function loadState() {
    try {
      setBootError(null);
      const s = await EchoAPI.getState();
      setState(s);
      bootedOnceRef.current = true;
    } catch (e: any) {
      const msg = e?.message || "Could not load state.";
      setBootError(msg);

      // If we previously had a state, keep showing the app instead of blocking UI.
      // Only show the big loader before first successful load.
      if (!bootedOnceRef.current) setState(null);
    }
  }

  useEffect(() => {
    loadState();
    // also tick the clock
    const clock = setInterval(() => setCurrentTime(Date.now()), 250);
    return () => clearInterval(clock);
  }, []);

  // ---- Polling strategy ----
  // - If authed + actively mining: refresh frequently (server truth)
  // - Otherwise: light polling to keep wallet/session info fresh
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;

      // No state yet? try boot again
      if (!state) {
        await loadState();
        return;
      }

      try {
        // If you're logged in and mining is active, use the mining refresh route
        if ((state as any).authed && state.session?.isActive) {
          const updated = await EchoAPI.refreshState();
          if (!cancelled) setState(updated);
        } else {
          // Light refresh when not mining or not authed (keeps wallet verified/status updated)
          const updated = await EchoAPI.getState();
          if (!cancelled) setState(updated);
        }
      } catch {
        // Don’t crash UI on a single failed poll; keep last good state.
      }
    }

    // cadence
    const fast = setInterval(() => {
      // fast lane only when mining is active
      if (state?.session?.isActive) tick();
    }, 1500);

    const slow = setInterval(() => {
      // slow lane always
      tick();
    }, 15000);

    // also refresh immediately when state changes from null -> object
    if (state) tick();

    return () => {
      cancelled = true;
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [state?.session?.isActive, (state as any)?.authed]); // keep deps tight

  // ---- Client-side earnings estimate between refreshes ----
  const sessionEarnings = useMemo(() => {
    if (!state?.session?.isActive) return 0;

    const startedAtMs = toMs((state.session as any).startedAt);
    const lastAccruedAtMs = toMs((state.session as any).lastAccruedAt);

    const baseRatePerHr = Number((state.session as any).baseRatePerHr ?? 0);
    const multiplier = Number((state.session as any).multiplier ?? 1);
    const sessionMined = Number((state.session as any).sessionMined ?? 0);

    if (!startedAtMs || !lastAccruedAtMs || !Number.isFinite(baseRatePerHr) || baseRatePerHr <= 0) {
      return sessionMined;
    }

    const endsAtMs = startedAtMs + SESSION_DURATION_MS;
    const effectiveNow = Math.min(currentTime, endsAtMs);
    const deltaSec = Math.max(0, (effectiveNow - lastAccruedAtMs) / 1000);

    const ratePerSec = (baseRatePerHr * multiplier) / 3600;
    const est = sessionMined + deltaSec * ratePerSec;

    return est;
  }, [state, currentTime]);

  // ---- Initial loader (only before first successful getState) ----
  if (!state) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center px-6">
        <div className="font-black tracking-widest text-white/20 animate-pulse">
          Initializing Voyager Node...
        </div>
        {bootError && (
          <div className="mt-4 text-xs text-red-400/90 max-w-[520px]">
            {bootError}
            <div className="mt-2">
              <button
                onClick={loadState}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const walletAddress = (state as any).wallet?.address ?? null;
  const walletVerified = Boolean((state as any).wallet?.verified);

  // If WalletTab verifies, we MUST refetch state from server so the UI never guesses.
  const handleWalletVerified = async () => {
    await loadState();
  };

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
              // server will 401 if not authed/verified — UI should handle that messaging in MineTab
              const updated = await EchoAPI.startSession();
              setState(updated);
            }}
            totalMultiplier={
              state.session?.isActive
                ? Number((state.session as any).multiplier ?? 1)
                : 1
            }
            effectiveRate={
              // effective rate per second (for any existing UI that expects it)
              (Number((state.session as any).baseRatePerHr ?? 0) * Number((state.session as any).multiplier ?? 1)) /
              3600
            }
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
            totalMinedEcho={(state as any).user?.totalMinedEcho ?? 0}
            verifiedWalletAddress={walletVerified ? walletAddress : null}
            // If your WalletTab supports it, keep this:
            // onVerified={handleWalletVerified}
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


