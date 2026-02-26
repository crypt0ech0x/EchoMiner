"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";
import { Tab } from "@/lib/types";

// This is the REAL shape your /api/state returns (based on the JSON you pasted)
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
    },
  });
  // This prevents the iPhone “string did not match expected pattern” crashes when HTML is returned
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from ${url}: ${text.slice(0, 120)}...`);
  }
  return data as T;
}

export default function EchoMinerApp() {
  const [apiState, setApiState] = useState<ApiState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadState = useCallback(async () => {
    setLoadError(null);
    try {
      const s = await fetchJson<ApiState>("/api/state");
      if (!s || typeof s.ok !== "boolean") throw new Error("Bad /api/state shape");
      setApiState(s);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load state");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    loadState();
  }, [loadState]);

  // poll state (slower + safer than every 1s)
  useEffect(() => {
    const id = setInterval(() => {
      loadState();
    }, 2500);
    return () => clearInterval(id);
  }, [loadState]);

  // When wallet verifies, we want the parent to refetch server truth
  const handleWalletVerified = useCallback(() => {
    loadState();
  }, [loadState]);

  // ---- Derive the props your existing components expect, without fighting TS types ----
  // We intentionally cast to "any" at the boundary because your UI components were built for AppState.
  const legacyStateForUI = useMemo(() => {
    if (!apiState) return null;

    // Provide the minimum fields your UI likely uses.
    // Anything extra is fine; missing fields would crash, so we default them.
    const s: any = {
      // wallet
      walletAddress: apiState.wallet.address,
      walletVerified: apiState.wallet.verified,
      wallet: apiState.wallet,

      // user
      user: {
        totalMined: apiState.user.totalMinedEcho ?? 0,
      },

      // session (some components might expect different names; provide safe defaults)
      session: {
        isActive: apiState.session.isActive,
        sessionMined: apiState.session.sessionMined ?? 0,
        baseRate: apiState.session.baseRatePerHr ?? 0,
        effectiveRate: (apiState.session.baseRatePerHr ?? 0) * (apiState.session.multiplier ?? 1),
        startTime: apiState.session.startedAt ? new Date(apiState.session.startedAt).getTime() : 0,
      },
    };

    return s;
  }, [apiState]);

  // compute session earnings safely (works even if MineTab expects earnings)
  const sessionEarnings = useMemo(() => {
    if (!apiState?.session?.isActive) return 0;
    return apiState.session.sessionMined ?? 0;
  }, [apiState]);

  // ---- UI states ----
  if (isLoading && !apiState) {
    return (
      <div className="h-screen bg-background flex items-center justify-center font-black tracking-widest text-white/20 animate-pulse">
        Initializing Voyager Node...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center px-6">
        <div className="text-white font-black text-xl mb-3">Couldn’t load the app</div>
        <div className="text-white/60 text-sm mb-6 break-words max-w-[520px]">{loadError}</div>
        <button
          onClick={loadState}
          className="px-5 py-3 rounded-xl bg-white/10 border border-white/10 text-white font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  // If not authed: still render the layout + Wallet tab so user can verify and get a session cookie.
  // (Your /api/state returned authed:false, which is why you were stuck before.)
  const authed = apiState?.authed === true;

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-background">
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full" />
      <div className="absolute top-1/2 -right-24 w-64 h-64 bg-teal-600/10 blur-[100px] rounded-full" />

      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab as any}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        state={(legacyStateForUI ?? {}) as any}
      >
        {!authed ? (
          <div className="px-6 pt-6 space-y-6">
            <div className="glass rounded-2xl p-5 border border-white/10">
              <div className="text-white font-black text-lg">Almost there</div>
              <div className="text-white/60 text-sm mt-1">
                You’re not logged in yet. Verify your wallet to create a session cookie, then the mining tabs will unlock.
              </div>
              <div className="text-white/40 text-xs mt-3">
                (Your server returned <span className="font-mono">authed: false</span> from <span className="font-mono">/api/state</span>)
              </div>
            </div>

            <WalletTab
              totalMinedEcho={apiState?.user?.totalMinedEcho ?? 0}
              verifiedWalletAddress={apiState?.wallet?.verified ? apiState.wallet.address : null}
              // If you add this prop in WalletTab, call it after verify success:
              // onVerified={handleWalletVerified}
              // For now, we still refetch every 2.5s so it will update anyway.
            />
          </div>
        ) : (
          <>
            {activeTab === Tab.MINE && (
              <MineTab
                state={legacyStateForUI as any}
                sessionEarnings={sessionEarnings as any}
                onStartSession={async () => {
                  await fetchJson("/api/mining/start", { method: "POST", body: JSON.stringify({ baseRatePerHr: 1 }) });
                  await loadState();
                }}
                totalMultiplier={
                  apiState?.session?.isActive ? apiState.session.multiplier ?? 1 : 1
                }
                effectiveRate={(apiState.session.baseRatePerHr ?? 0) * (apiState.session.multiplier ?? 1)}
                currentTime={Date.now()}
                onOpenBoosts={() => setActiveTab(Tab.BOOST)}
              />
            )}

            {activeTab === Tab.BOOST && (
              <BoostTab state={legacyStateForUI as any} onApplyAdBoost={loadState as any} currentTime={Date.now()} />
            )}

            {activeTab === Tab.STORE && <StoreTab state={legacyStateForUI as any} onPurchase={loadState as any} />}

            {activeTab === Tab.WALLET && (
              <WalletTab
                totalMinedEcho={apiState?.user?.totalMinedEcho ?? 0}
                verifiedWalletAddress={apiState?.wallet?.verified ? apiState.wallet.address : null}
                // If you add onVerified to WalletTab, uncomment:
                // onVerified={handleWalletVerified}
              />
            )}
          </>
        )}
      </Layout>

      <ProfileDrawer
        isOpen={isProfileOpen || isNotificationsOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setIsNotificationsOpen(false);
        }}
        state={(legacyStateForUI ?? {}) as any}
        onUpdateUser={() => loadState()}
        initialView={isNotificationsOpen ? ("notifications" as any) : ("main" as any)}
      />
    </div>
  );
}