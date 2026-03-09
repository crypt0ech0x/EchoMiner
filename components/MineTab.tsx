import React, { useMemo } from 'react';
import { AppState } from '../types';
import { Play, TrendingUp, Flame, Zap, ChevronRight, Activity, Clock, Info, Sparkles } from 'lucide-react';
import { GET_STREAK_MULTIPLIER } from '../constants';

interface MineTabProps {
  state: AppState;
  sessionEarnings: number;
  balanceCardTotal: number;
  onStartSession: () => void;
  totalMultiplier: number;
  effectiveRate: number;
  currentTime: number;
  onOpenBoosts: () => void;
}

const MineTab: React.FC<MineTabProps> = ({ 
  state, 
  sessionEarnings,
  balanceCardTotal,
  onStartSession, 
  totalMultiplier, 
  effectiveRate,
  currentTime,
  onOpenBoosts
}) => {
  const isActive = state.session.isActive;
  
  const timeLeft = state.session.endTime ? state.session.endTime - currentTime : 0;
  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const progress = isActive && state.session.startTime && state.session.endTime 
    ? ((currentTime - state.session.startTime) / (state.session.endTime - state.session.startTime)) * 100 
    : 0;

  // --- 8-Hour Multi-Phase Color Transition System ---
  const PHASES = [
    { r: 239, g: 68, b: 68 },   // 1. Red
    { r: 249, g: 115, b: 22 },  // 2. Orange
    { r: 234, g: 179, b: 8 },   // 3. Yellow
    { r: 34, g: 197, b: 94 },   // 4. Green
    { r: 59, g: 130, b: 246 },  // 5. Blue
    { r: 99, g: 102, b: 241 },  // 6. Indigo
    { r: 139, g: 92, b: 246 },  // 7. Violet
    { r: 212, g: 175, b: 55 },  // 8. Gold
  ];

  const dynamicColor = useMemo(() => {
    if (!isActive) return 'rgb(139, 92, 246)'; 
    const cycleMs = 8 * 60 * 60 * 1000;
    const phaseProgress = (currentTime % cycleMs) / cycleMs;
    const phaseValue = phaseProgress * PHASES.length;
    const index = Math.floor(phaseValue);
    const nextIndex = (index + 1) % PHASES.length;
    const factor = phaseValue - index;
    const c1 = PHASES[index];
    const c2 = PHASES[nextIndex];
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }, [isActive, currentTime]);

  const radius = 135;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  const displayMultiplier = isActive 
    ? totalMultiplier 
    : GET_STREAK_MULTIPLIER(state.streak.currentStreak + 1);

  return (
    <div className="px-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1) Top Balance Card */}
      <div className="glass rounded-[32px] p-5 flex items-center justify-between border border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent pointer-events-none"></div>
        <div className="flex items-center gap-4 relative z-10">
          <div className={`w-14 h-14 rounded-full p-0.5 relative overflow-hidden transition-all duration-500 ${state.user.priorityAirdrop ? 'bg-gradient-to-tr from-yellow-400 via-purple-500 to-teal-400 animate-spin-slow shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/10'}`}>
            <div className="w-full h-full rounded-full relative overflow-hidden bg-[#020617] p-0.5">
               <img 
                 src={state.user.pfpUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${state.user.id}&backgroundColor=0f172a`} 
                 className="w-full h-full rounded-full object-cover"
                 alt="Voyager"
               />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.15em] truncate max-w-[180px]">
              {state.user.username}'s Balance
            </p>
            <h1 className="text-3xl font-black tracking-tighter text-white tabular-nums text-glow leading-none">
              {balanceCardTotal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
            </h1>
          </div>
        </div>
        <div className="text-xl font-black italic tracking-tighter text-white/20 select-none">
          ECHO
        </div>
      </div>

      {/* 2) Stats Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-3xl p-4 border border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400">
            <Flame className="w-5 h-5 fill-current" />
          </div>
          <div>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Day Streak</p>
            <p className="text-xl font-black text-white">{state.streak.currentStreak}D</p>
          </div>
        </div>
        <div className="glass rounded-3xl p-4 border border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Multiplier</p>
            <p className="text-xl font-black text-white">{displayMultiplier.toFixed(1)}x</p>
          </div>
        </div>
      </div>

      {/* 3) Central Mining Core */}
      <div className="relative flex justify-center py-4">
        <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] flex items-center justify-center">
          <div 
            className={`absolute inset-0 rounded-full blur-[80px] transition-all duration-1000 ${isActive ? 'scale-110 opacity-30' : 'scale-100 bg-purple-600 opacity-20'}`}
            style={isActive ? { backgroundColor: dynamicColor } : {}}
          ></div>

          {isActive && (
            <div 
              className="absolute inset-0 rounded-full border-2 animate-pulse-ring"
              style={{ borderColor: dynamicColor, opacity: 0.3 }}
            ></div>
          )}

          <div className={`absolute inset-2 rounded-full border border-white/5 animate-spin-slow`}>
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle
                cx="50" cy="50" r="48"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-white/10"
                strokeDasharray="2 6"
              />
            </svg>
          </div>

          <div className="relative w-[300px] h-[300px] sm:w-[320px] sm:h-[320px] flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 320 320">
              <circle
                cx="160" cy="160" r={radius}
                className="fill-none stroke-white/[0.03]"
                strokeWidth="10"
              />
              {isActive && (
                <circle
                  cx="160" cy="160" r={radius}
                  className="fill-none transition-all duration-1000 ease-linear"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ 
                    stroke: dynamicColor, 
                    filter: `drop-shadow(0 0 10px ${dynamicColor}88)` 
                  }}
                />
              )}
              {!isActive && (
                <circle
                  cx="160" cy="160" r={radius}
                  className="fill-none stroke-purple-500/20"
                  strokeWidth="1"
                />
              )}
            </svg>

            <div className="relative w-[88%] h-[88%] rounded-full overflow-hidden group shadow-2xl">
              <div className={`absolute inset-0 transition-all duration-1000 ${
                isActive 
                  ? 'bg-gradient-to-br from-slate-900 via-slate-950 to-black' 
                  : 'bg-gradient-to-br from-purple-800 via-indigo-950 to-slate-950'
              }`}></div>
              
              <div className="noise-overlay"></div>

              {!isActive && (
                <button 
                  onClick={onStartSession}
                  className="absolute inset-0 flex flex-col items-center justify-center z-10 transition-transform active:scale-95 group"
                >
                  <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-5 border border-white/20 group-hover:bg-white/20 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-sm">
                    <Play className="w-12 h-12 fill-white ml-1" />
                  </div>
                  <span className="text-white text-2xl font-black tracking-tight drop-shadow-lg">START SESSION</span>
                  <p className="text-white/40 text-[11px] font-bold mt-2 uppercase tracking-[0.2em]">Begin 24h mining cycle</p>
                  <div className="mt-6 px-4 py-1.5 bg-black/40 rounded-full border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest">
                    ~1.00 ECHO / day
                  </div>
                </button>
              )}

              {isActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 animate-in zoom-in-95 duration-700 px-4 text-center">
                  <div className="flex flex-col items-center max-w-full">
                    <span className="text-3xl sm:text-4xl font-black tabular-nums leading-none tracking-tighter text-white whitespace-nowrap overflow-visible">
                      +{sessionEarnings.toFixed(7)}
                    </span>
                    <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.4em] mt-3 opacity-80">ECHO</p>
                  </div>
                  
                  <div className="mt-8 flex flex-col items-center gap-3">
                     <div className="px-3 py-1 bg-black/40 rounded-full border border-white/10">
                       <p className="font-mono font-black text-[11px] tracking-widest text-slate-300">
                        {(effectiveRate * 3600).toFixed(4)} E/H
                       </p>
                     </div>
                     
                     <div className="flex items-center gap-2 opacity-60">
                       <Clock className="w-3.5 h-3.5 text-slate-400" />
                       <span className="text-white font-mono text-[11px] font-black tracking-[0.15em]">
                         {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                       </span>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isActive && (
            <div className="absolute top-4 left-4 z-20 animate-in slide-in-from-top-4 duration-500">
              <div className="bg-[#020617]/90 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-2xl flex items-center gap-2 shadow-2xl">
                <div 
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: dynamicColor, boxShadow: `0 0 10px ${dynamicColor}` }}
                ></div>
                <span className="text-white text-[10px] font-black uppercase tracking-widest opacity-80">Mining Active</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4) Bottom Info / CTA Section */}
      <div className="space-y-4">
        {isActive ? (
          <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-4">
            <div className="glass rounded-[32px] p-6 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                 <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Mining Progress</h4>
                 <span className="text-[10px] font-black text-white">{progress.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full transition-all duration-1000"
                  style={{ 
                    width: `${progress}%`,
                    backgroundColor: dynamicColor,
                    boxShadow: `0 0 12px ${dynamicColor}44`
                  }}
                ></div>
              </div>
              
              <div className="pt-2 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Streak Bonus</p>
                   <p className="text-sm font-black text-white">{state.streak.currentStreak}x Active</p>
                </div>
                <div className="space-y-1 text-right">
                   <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Network Flow</p>
                   <p className="text-sm font-black text-white">{effectiveRate.toFixed(8)} E/s</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={onOpenBoosts}
              className="w-full bg-gradient-to-r from-purple-600/10 to-indigo-600/10 rounded-[24px] p-5 flex items-center justify-between border border-purple-500/20 group hover:border-purple-500/40 transition-all shadow-lg active:scale-98"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 fill-white" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-black text-white uppercase tracking-tight">Boost Mining Speed</span>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest">Activate 2x Multiplier Now</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-all" />
            </button>
          </div>
        ) : (
          <div className="glass rounded-[24px] px-6 py-6 border border-white/5 flex items-center justify-between animate-in fade-in duration-700">
             <div className="flex flex-col items-center">
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest mb-1.5">Standard Cycle</p>
                <p className="text-[12px] font-black text-white">24 Hours</p>
             </div>
             <div className="w-px h-8 bg-white/10"></div>
             <div className="flex flex-col items-center">
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest mb-1.5">Grace Period</p>
                <p className="text-[12px] font-black text-white">24 Hours</p>
             </div>
             <div className="w-px h-8 bg-white/10"></div>
             <div className="flex flex-col items-center">
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest mb-1.5">Next Multiplier</p>
                <p className="text-[12px] font-black text-teal-400">{displayMultiplier.toFixed(1)}x</p>
             </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default MineTab;