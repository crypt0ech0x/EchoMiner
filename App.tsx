
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tab, AppState, StoreItem } from './types';
import { AuthoritativeServer } from './server';
import Layout from './components/Layout';
import MineTab from './components/MineTab';
import BoostTab from './components/BoostTab';
import StoreTab from './components/StoreTab';
import WalletTab from './components/WalletTab';
import ProfileDrawer, { DrawerSubView } from './components/ProfileDrawer';

const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MINE);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [drawerInitialView, setDrawerInitialView] = useState<DrawerSubView>('main');
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Initial Data Fetch
  useEffect(() => {
    AuthoritativeServer.getState().then(setState);
  }, []);

  // Notification Trigger Monitoring
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!state) return;
      const now = Date.now();
      setCurrentTime(now);
      
      let updatedState = state;
      let changed = false;

      // 1. Auto-settle if a session has ended
      if (state.session.isActive && state.session.endTime && now >= state.session.endTime) {
        updatedState = await AuthoritativeServer.settleSessions();
        updatedState = await AuthoritativeServer.addNotification(
          'session_end', 
          'Mining Session Complete', 
          `Your 24h mining cycle has concluded. Claimed +${(state.session.endTime - (state.session.startTime || 0)) / 1000 * state.session.effectiveRate} ECHO.`
        );
        changed = true;
      }

      // 2. Streak Grace Warning (exactly 2 hours before)
      if (state.streak.graceEndsAt && !state.session.isActive) {
        const warningTime = state.streak.graceEndsAt - 7200000; // 2 hours
        const alreadyNotified = state.notifications.find(n => n.type === 'streak_grace_warning' && now - n.createdAt < 3600000);
        if (now >= warningTime && now < state.streak.graceEndsAt && !alreadyNotified) {
          updatedState = await AuthoritativeServer.addNotification(
            'streak_grace_warning',
            'Streak At Risk!',
            'Your streak grace period ends in 2 hours. Start a new session now to keep your multiplier.'
          );
          changed = true;
        }
      }

      // 3. Boost Expiry Warning
      const expiredBoost = state.activeBoosts.find(b => b.expiresAt <= now && b.expiresAt > now - 2000); // Check within a 2s window
      if (expiredBoost) {
        updatedState = await AuthoritativeServer.addNotification(
          'boost_expired',
          'Boost Deactivated',
          'Your 2x Ad-Watch multiplier has expired. Activate a new one in the Boost tab.'
        );
        changed = true;
      }

      if (changed) {
        setState(updatedState);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const handleStartSession = async () => {
    try {
      const newState = await AuthoritativeServer.startSession();
      setState(newState);
    } catch (e: any) { alert(e.message); }
  };

  const handleApplyAdBoost = async () => {
    try {
      const newState = await AuthoritativeServer.activateAdBoost();
      setState(newState);
    } catch (e: any) { alert(e.message); }
  };

  const handlePurchaseUpdate = (newState: AppState) => { setState(newState); };
  const handleWalletUpdate = (newState: AppState) => { setState(newState); };
  const handleUpdateUser = (newState: AppState) => { setState(newState); };

  const sessionEarnings = useMemo(() => {
    if (!state || !state.session.isActive || !state.session.startTime) return 0;
    const elapsedSec = (currentTime - state.session.startTime) / 1000;
    return Math.min(elapsedSec * state.session.effectiveRate, (24 * 3600) * state.session.effectiveRate);
  }, [state, currentTime]);

  if (!state) return null;

  const renderTab = () => {
    switch (activeTab) {
      case Tab.MINE:
        return <MineTab state={state} sessionEarnings={sessionEarnings} onStartSession={handleStartSession} totalMultiplier={state.session.isActive ? (state.session.effectiveRate / state.session.baseRate) : 1} effectiveRate={state.session.effectiveRate} currentTime={currentTime} onOpenBoosts={() => setActiveTab(Tab.BOOST)} />;
      case Tab.BOOST:
        return <BoostTab state={state} onApplyAdBoost={handleApplyAdBoost} currentTime={currentTime} />;
      case Tab.STORE:
        return <StoreTab state={state} onPurchase={handlePurchaseUpdate} />;
     case Tab.WALLET:
      return (
        <WalletTab
          totalMinedEcho={state.user.totalMined}
          verifiedWalletAddress={state.walletAddress ?? null}
        />
      );
    default:
      return null;
  }
};

  return (
    <div className="h-screen w-screen flex flex-col bg-[#020617] text-white relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full"></div>
      <div className="absolute top-1/2 -right-24 w-64 h-64 bg-teal-600/10 blur-[100px] rounded-full"></div>
      
      <Layout 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenProfile={() => { setDrawerInitialView('main'); setIsProfileOpen(true); }}
        onOpenNotifications={() => { setDrawerInitialView('notifications'); setIsProfileOpen(true); }}
        state={state}
      >
        {renderTab()}
      </Layout>

      <ProfileDrawer 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        state={state}
        onUpdateUser={handleUpdateUser}
        initialView={drawerInitialView}
      />
    </div>
  );
};

export default App;
