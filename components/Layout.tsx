import React from 'react';
import { Tab, AppState } from '@/lib/types';
import { Pickaxe, Zap, ShoppingCart, Wallet, User, Bell } from 'lucide-react';

interface LayoutProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  state: AppState;
  children: React.ReactNode;
}

const navItems = [
  { id: Tab.MINE, label: 'Mine', icon: Pickaxe },
  { id: Tab.BOOST, label: 'Boost', icon: Zap },
  { id: Tab.STORE, label: 'Store', icon: ShoppingCart },
  { id: Tab.WALLET, label: 'Wallet', icon: Wallet },
];

export default function Layout({
  activeTab,
  setActiveTab,
  onOpenProfile,
  onOpenNotifications,
  state,
  children,
}: LayoutProps) {
  return (
    <div className="h-screen w-screen flex flex-col text-white overflow-hidden">
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.35)]">
            <Pickaxe className="w-7 h-7 text-white" />
          </div>

          <div>
            <div className="text-3xl font-black tracking-tight leading-none">
              <span className="text-white">ECHO</span>
              <span className="text-teal-400">MINER</span>
            </div>
            <div className="text-[10px] tracking-[0.35em] font-black text-white/50 mt-1 uppercase">
              Pre-Launch Alpha
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenNotifications}
            className="w-14 h-14 rounded-3xl glass border border-white/10 flex items-center justify-center text-white/80 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="w-6 h-6" />
          </button>

          <button
            onClick={onOpenProfile}
            className="w-14 h-14 rounded-3xl glass border border-white/10 flex items-center justify-center text-white/80 hover:text-white"
            aria-label="Profile"
          >
            <User className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </main>

      <nav className="px-5 pb-5 pt-3">
        <div className="glass rounded-[32px] border border-white/10 px-3 py-3">
          <div className="grid grid-cols-4 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="relative flex flex-col items-center justify-center gap-2 py-3 rounded-2xl transition"
                >
                  <Icon
                    className={`w-7 h-7 ${
                      active ? 'text-violet-400' : 'text-slate-400'
                    }`}
                  />
                  <span
                    className={`text-sm font-bold ${
                      active ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <div className="absolute -bottom-1 w-2 h-2 rounded-full bg-violet-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}