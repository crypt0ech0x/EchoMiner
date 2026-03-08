import React, { useMemo } from "react";
import { AppState } from "../types";
import {
  Play,
  TrendingUp,
  Flame,
  Zap,
  ChevronRight,
  Activity,
  Clock,
  Info,
  Sparkles,
} from "lucide-react";
import { GET_STREAK_MULTIPLIER } from "../constants";

interface MineTabProps {
  state: AppState;
  sessionEarnings: number;
  onStartSession: () => void;
  totalMultiplier: number;
  effectiveRate: number;
  currentTime: number;
  onOpenBoosts: () => void;
}

const MineTab: React.FC<MineTabProps> = ({
  state,
  sessionEarnings,
  onStartSession,
  totalMultiplier,
  effectiveRate,
  currentTime,
  onOpenBoosts,
}) => {
  // FIX:
  // Use settled mined total directly instead of state.user.balance.
  // balance can drift or reset during auth/wallet switching, while totalMined
  // is the canonical mined total the card should build on.
  const settledTotal = Number(state.user.totalMined ?? 0);

  // sessionEarnings is already "live session mined so far"
  // (DB sessionMined + smoothed accrual since lastAccruedAt).
  const currentTotal = settledTotal + (state.session.isActive ? sessionEarnings : 0);

  const isActive = state.session.isActive;
  const timeLeft = state.session.endTime ? state.session.endTime - currentTime : 0;

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const progress =
    isActive && state.session.startTime && state.session.endTime
      ? ((currentTime - state.session.startTime) /
          (state.session.endTime - state.session.startTime)) *
        100
      : 0;

  const PHASES = [
    { r: 239, g: 68, b: 68 },   // Red
    { r: 249, g: 115, b: 22 },  // Orange
    { r: 234, g: 179, b: 8 },   // Yellow
    { r: 34, g: 197, b: 94 },   // Green
    { r: 59, g: 130, b: 246 },  // Blue
    { r: 99, g: 102, b: 241 },  // Indigo
    { r: 139, g: 92, b: 246 },  // Violet
    { r: 212, g: 175, b: 55 },  // Gold
  ];

  const dynamicColor = useMemo(() => {
    if (!isActive) return "rgb(139, 92, 246)";

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
    <div className="px-5 py-6 space-y-6">
      {/* Top Balance Card */}
      <div className="glass rounded-3xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-[0.25em] text-white/50 font-black">
            {state.user.username}&apos;s Balance
          </div>
          <Sparkles className="w-4 h-4 text-white/40" />
        </div>

        <div className="text-4xl font-black tracking-tight text-white">
          {currentTotal.toLocaleString(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          })}
        </div>

        <div className="text-sm text-white/50 font-bold mt-1">ECHO</div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4 border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black">
            Day Streak
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {state.streak.currentStreak}D
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/10">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-black">
            Multiplier
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {displayMultiplier.toFixed(1)}x
          </div>
        </div>
      </div>

      {/* Central Mining Core */}
      <div className="glass rounded-[2rem] p-6 border border-white/10">
        <div className="relative flex items-center justify-center">
          <svg width="320" height="320" className="-rotate-90">
            <circle
              cx="160"
              cy="160"
              r={radius}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="16"
              fill="none"
            />
            <circle
              cx="160"
              cy="160"
              r={radius}
              stroke={dynamicColor}
              strokeWidth="16"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.5s ease" }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {!isActive && (
              <>
                <button
                  onClick={onStartSession}
                  className="w-28 h-28 rounded-full bg-white text-slate-950 font-black text-sm tracking-[0.15em] uppercase shadow-2xl shadow-white/10 hover:scale-[1.02] transition"
                >
                  <div className="flex flex-col items-center justify-center">
                    <Play className="w-5 h-5 mb-2" />
                    Start
                  </div>
                </button>

                <div className="mt-5 text-sm font-black text-white">START SESSION</div>
                <div className="text-xs text-white/45 font-bold mt-1">
                  Begin 24h mining cycle
                </div>
                <div className="text-xs text-white/35 font-bold mt-2">
                  ~1.00 ECHO / day
                </div>
              </>
            )}

            {isActive && (
              <>
                <div className="text-3xl font-black text-white">
                  +{sessionEarnings.toFixed(7)}
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/45 font-black mt-1">
                  ECHO
                </div>

                <div className="mt-4 text-sm font-black text-white">
                  {(effectiveRate * 3600).toFixed(4)} E/H
                </div>

                <div className="mt-2 text-xs font-mono text-white/60">
                  {String(hours).padStart(2, "0")}:
                  {String(minutes).padStart(2, "0")}:
                  {String(seconds).padStart(2, "0")}
                </div>
              </>
            )}
          </div>
        </div>

        {isActive && (
          <div className="mt-4 flex items-center justify-center gap-2 text-emerald-300">
            <Activity className="w-4 h-4" />
            <span className="text-sm font-black">Mining Active</span>
          </div>
        )}
      </div>

      {/* Bottom Info / CTA */}
      <div className="glass rounded-3xl p-5 border border-white/10">
        {isActive ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-white">Mining Progress</div>
                <div className="text-xs text-white/45 font-bold mt-1">
                  {progress.toFixed(1)}%
                </div>
              </div>
              <TrendingUp className="w-5 h-5 text-white/40" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-black">
                  Streak Bonus
                </div>
                <div className="mt-2 text-sm font-black text-white">
                  {state.streak.currentStreak}x Active
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-black">
                  Network Flow
                </div>
                <div className="mt-2 text-sm font-black text-white">
                  {effectiveRate.toFixed(8)} E/s
                </div>
              </div>

              <button
                onClick={onOpenBoosts}
                className="rounded-2xl bg-white text-slate-950 p-3 text-left"
              >
                <div className="text-[10px] uppercase tracking-[0.18em] font-black opacity-70">
                  Boost
                </div>
                <div className="mt-2 text-sm font-black flex items-center gap-1">
                  Activate
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-black">
                Standard Cycle
              </div>
              <div className="mt-2 text-sm font-black text-white">24 Hours</div>
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-black">
                Grace Period
              </div>
              <div className="mt-2 text-sm font-black text-white">24 Hours</div>
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-black">
                Next Multiplier
              </div>
              <div className="mt-2 text-sm font-black text-white">
                {displayMultiplier.toFixed(1)}x
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MineTab;