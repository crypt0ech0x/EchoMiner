
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Tab, AppState } from '@/lib/types';
import { EchoAPI } from '@/lib/api';
import Layout from '@/components/Layout';
import MineTab from '@/components/MineTab';
import BoostTab from '@/components/BoostTab';
import StoreTab from '@/components/StoreTab';
import WalletTab from '@/components/WalletTab';
import ProfileDrawer, { DrawerSubView } from '@/components/ProfileDrawer';

export default function EchoMinerApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    EchoAPI.getState().then(setState);
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!state) return;
      const now = Date.now();
      setCurrentTime(now);
      
      const updated = await EchoAPI.refreshState();
      setState(updated);
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const sessionEarnings = useMemo(() => {
    if (!state?.session.isActive || !state.session.startTime) return 0;
    const elapsedSec = (currentTime - state.session.startTime) / 1000;
    return Math.min(elapsedSec * state.session.effectiveRate, 86400 * state.session.effectiveRate);
  }, [state, currentTime]);

  if (!state) return <div className="h-screen bg-background flex items-center justify-center font-black tracking-widest text-white/20 animate-pulse">Initializing Voyager Node...</div>;

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-background">
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full" />
      <div className="absolute top-1/2 -right-24 w-64 h-64 bg-teal-600/10 blur-[100px] rounded-full" />
      
      <Layout 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        state={state}
      >
        {activeTab === Tab.MINE && <MineTab state={state} sessionEarnings={sessionEarnings} onStartSession={async () => setState(await EchoAPI.startSession())} totalMultiplier={state.session.isActive ? (state.session.effectiveRate / state.session.baseRate) : 1} effectiveRate={state.session.effectiveRate} currentTime={currentTime} onOpenBoosts={() => setActiveTab(Tab.BOOST)} />}
        {activeTab === Tab.BOOST && <BoostTab state={state} onApplyAdBoost={async () => setState(await EchoAPI.activateAdBoost())} currentTime={currentTime} />}
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
        onClose={() => { setIsProfileOpen(false); setIsNotificationsOpen(false); }} 
        state={state} 
        onUpdateUser={setState}
        initialView={isNotificationsOpen ? 'notifications' : 'main'}
      />
    </div>
  );
}

