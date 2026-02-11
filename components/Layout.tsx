
import React from 'react';
import { Tab, AppState } from '../types';
import { Pickaxe, Zap, ShoppingCart, Wallet, User, Bell } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  state: AppState;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onOpenProfile, onOpenNotifications, state }) => {
  const tabs = [
    { id: Tab.MINE, label: 'Mine', icon: Pickaxe },
    { id: Tab.BOOST, label: 'Boost', icon: Zap },
    { id: Tab.STORE, label: 'Store', icon: ShoppingCart },
    { id: Tab.WALLET, label: 'Wallet', icon: Wallet },
  ];

  const unreadCount = state.notifications.filter(n => !n.readAt).length;

  return (
    <div className="flex flex-col h-full w-full relative z-10 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Pickaxe className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black leading-none tracking-tight">ECHO<span className="text-teal-400">MINER</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Pre-launch Alpha</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onOpenNotifications}
            className="w-11 h-11 rounded-2xl glass flex items-center justify-center hover:bg-white/10 transition-all active:scale-95 group relative"
          >
            <Bell className="w-5 h-5 text-slate-300 group-hover:text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-black text-white border-2 border-[#020617] animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button 
            onClick={onOpenProfile}
            className="w-11 h-11 rounded-2xl glass flex items-center justify-center hover:bg-white/10 transition-all active:scale-95 group"
          >
            <User className="w-5 h-5 text-slate-300 group-hover:text-white" />
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {children}
      </main>

      {/* Bottom Nav Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-6 pointer-events-none">
        <nav className="pointer-events-auto mx-auto max-w-md h-20 glass rounded-[32px] flex items-center justify-around px-4 border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Subtle bottom nav background glow */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
          
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 group ${
                  isActive ? 'text-white' : 'text-slate-500'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-purple-500/10 rounded-2xl blur-sm transition-all duration-500"></div>
                )}
                <Icon className={`w-6 h-6 relative z-10 transition-transform ${isActive ? 'scale-110 text-purple-400' : 'group-hover:text-slate-300'}`} />
                <span className="text-[10px] font-bold mt-1 relative z-10 tracking-wide">{tab.label}</span>
                {isActive && (
                  <div className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_12px_#8b5cf6]"></div>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default Layout;
