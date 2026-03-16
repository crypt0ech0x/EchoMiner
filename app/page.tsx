// app/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Tab, AppState } from "@/lib/types";
import { EchoAPI } from "@/lib/api";
import Layout from "@/components/Layout";
import MineTab from "@/components/MineTab";
import BoostTab from "@/components/BoostTab";
import StoreTab from "@/components/StoreTab";
import WalletTab from "@/components/WalletTab";
import ProfileDrawer from "@/components/ProfileDrawer";

export default function EchoMinerApp() {
  const { publicKey, connected } = useWallet();

  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [now, setNow] = useState(() => Date.now());

  const connectedWalletAddress =
    connected && publicKey ? publicKey.toBase58() : null;
  const serverWalletAddress = state?.wallet?.address ?? null;

  const prevSessionActiveRef = useRef<boolean>(false);
  const justOpenedStoreAfterStartRef = useRef<boolean>(false);

  const hasPurchasedEcho = Number(state?.user?.totalPurchased ?? 0) > 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      if (connected && publicKey) {
        sessionStorage.setItem(
          "connected_wallet_address",
          publicKey.toBase58()
        );
        EchoAPI.setConnectedWalletAddress(publicKey.toBase58());
      } else {
        sessionStorage.removeItem("connected_wallet_address");
        EchoAPI.setConnectedWalletAddress(null);
      }
    } catch {
      // ignore
    }
  }, [connected, publicKey]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadError(null);
        const s = await EchoAPI.getState();
        if (!mounted) return;

        setState(s);

        if (!s.authed) {
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

  useEffect(() => {
    if (!connectedWalletAddress || !serverWalletAddress) return;
    if (connectedWalletAddress !== serverWalletAddress) {
      setActiveTab(Tab.WALLET);
    }
  }, [connectedWalletAddress, serverWalletAddress]);

  useEffect(() => {
    if (!state?.session?.isActive) return;

    const interval = setInterval(async () => {
      try {
        const updated = await EchoAPI.refreshState();
        setState(updated);
      } catch {
        // ignore transient refresh errors
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [state?.session?.isActive]);

  // Nudge non-buyers to Store when a session ends.
  useEffect(() => {
    if (!state) return;

    const currentActive = !!state.session?.isActive;
    const previousActive = prevSessionActiveRef.current;

    if (
      previousActive &&
      !currentActive &&
      !hasPurchasedEcho &&
      activeTab === Tab.MINE
    ) {
      setActiveTab(Tab.STORE);
    }

    prevSessionActiveRef.current = currentActive;
  }, [state, activeTab, hasPurchasedEcho]);

  const effectiveRatePerSec = useMemo(() => {
    return Number(state?.session?.effectiveRate ?? 0);
  }, [state]);

  const sessionEarnings = useMemo(() => {
    return Number(state?.session?.sessionMined ?? 0);
  }, [state]);

  // Total displayed balance:
  // mined + purchased + referral + bonus + live active session
  const balanceCardTotal = useMemo(() => {
    const mined = Number(state?.user?.totalMined ?? 0);
    const purchased = Number(state?.user?.totalPurchased ?? 0);
    const referral = Number((state?.user as any)?.totalReferral ?? 0);
    const bonus = Number((state?.user as any)?.totalBonus ?? 0);
    const liveSession = Number(state?.session?.sessionMined ?? 0);

    return mined + purchased + referral + bonus + liveSession;
  }, [state]);

  const totalMultiplier = useMemo(() => {
    return Number(state?.session?.multiplier ?? 1);
  }, [state]);

  const handleStartSession = async () => {
    if (walletMismatch) {
      setSessionError("Connected wallet does not match the verified wallet.");
      setActiveTab(Tab.WALLET);
      return;
    }

    try {
      setSessionError(null);
      setIsStartingSession(true);

      const updated = await EchoAPI.startSession();
      setState(updated);

      // If the user has never bought, nudge them to Store shortly after first successful start.
      if (Number(updated.user.totalPurchased ?? 0) <= 0) {
        justOpenedStoreAfterStartRef.current = true;
        window.setTimeout(() => {
          setActiveTab(Tab.STORE);
        }, 1200);
      }
    } catch (e: any) {
      console.error("start session failed:", e);

      const message = e?.data?.error || e?.message || "Failed to start session";

      setSessionError(message);

      if (e?.status === 409 && e?.data?.error === "Wallet session mismatch") {
        try {
          localStorage.removeItem(EchoAPI.STORAGE_KEY);
        } catch {
          // ignore
        }

        try {
          EchoAPI.setSessionId(null);
        } catch {
          // ignore
        }

        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          });
        } catch {
          // ignore
        }

        const fresh = await EchoAPI.getState().catch(() => null);
        if (fresh) setState(fresh);

        setActiveTab(Tab.WALLET);
        alert(message);
        return;
      }

      if (e?.status === 401) {
        setActiveTab(Tab.WALLET);
        alert(message);
        return;
      }

      try {
        const fresh = await EchoAPI.getState();
        setState(fresh);
      } catch {
        // ignore
      }

      alert(message);
    } finally {
      setIsStartingSession(false);
    }
  };

  if (loadError) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center text-center p-8">
        <div className="text-white/70 font-black tracking-widest mb-3">
          Couldn’t load
        </div>
        <div className="text-white/40 text-sm mb-6">{loadError}</div>
        <button
          className="px-5 py-3 rounded-xl bg-white/10 text-white font-bold"
          onClick={async () => {
            try {
              setLoadError(null);
              const s = await EchoAPI.getState();
              setState(s);
              if (!s.authed) setActiveTab(Tab.WALLET);
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

  const walletMismatch =
    !!connectedWalletAddress &&
    !!serverWalletAddress &&
    connectedWalletAddress !== serverWalletAddress;

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
          <>
            {sessionError && (
              <div className="mx-5 mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-200">
                {sessionError}
              </div>
            )}

            <MineTab
              state={state}
              sessionEarnings={sessionEarnings}
              balanceCardTotal={balanceCardTotal}
              effectiveRate={effectiveRatePerSec}
              totalMultiplier={totalMultiplier}
              currentTime={now}
              onOpenBoosts={() => setActiveTab(Tab.BOOST)}
              onStartSession={handleStartSession}
            />

            {isStartingSession && (
              <div className="mx-5 mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-bold text-white/70">
                Starting session...
              </div>
            )}
          </>
        )}

        {activeTab === Tab.BOOST && (
          <BoostTab
            state={state}
            onApplyAdBoost={async () => {
              const updated = await EchoAPI.activateAdBoost();
              setState(updated);
            }}
            currentTime={now}
          />
        )}

        {activeTab === Tab.STORE && (
          <StoreTab
            state={state}
            onPurchase={(updated) => {
              setState(updated);
              setActiveTab(Tab.MINE);
            }}
          />
        )}

        {activeTab === Tab.WALLET && (
          <WalletTab
            totalMinedEcho={state.user.totalMined}
            walletFromServer={{
              address: state.wallet?.address ?? null,
              verified: !!state.wallet?.verified,
              verifiedAt: state.wallet?.verifiedAt ?? null,
            }}
            onVerified={async () => {
              const fresh = await EchoAPI.getState();
              setState(fresh);

              if (fresh.authed) {
                const hasAnyPurchased =
                  Number(fresh.user.totalPurchased ?? 0) > 0;
                setActiveTab(hasAnyPurchased ? Tab.MINE : Tab.STORE);
              }
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
        onUpdateUser={setState}
        initialView={isNotificationsOpen ? "notifications" : "main"}
      />
    </div>
  );
}