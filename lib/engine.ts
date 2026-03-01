// lib/engine.ts
// Local (client) state engine used by older UI flows.
// Your DB routes are now the source of truth, but this file must still compile
// because some UI/components still import it.

import { AppState, MiningSession, StreakInfo, ActiveBoost, LedgerEntry, AppNotification } from "./types";

// --- Tunables (match your UI expectations) ---
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h (your MineTab UI says 24h)
const BASE_MINING_RATE_PER_SEC = 1 / (24 * 60 * 60); // ~1.0 ECHO/day by default
const LEDGER_HASH_PREFIX = "hash_";

// --- Helpers ---
function nowMs() {
  return Date.now();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function fakeHash() {
  return `${LEDGER_HASH_PREFIX}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function getStreakMultiplier(streakDays: number) {
  // Keep it simple (you can swap to your real streak curve)
  // 1.0x base, +0.1x per day capped at 3.0x
  return clamp(1 + streakDays * 0.1, 1, 3);
}

export function createInitialState(): AppState {
  const now = nowMs();

  const streak: StreakInfo = {
    currentStreak: 0,
    lastSessionStartAt: null,
    lastSessionEndAt: null,
    graceEndsAt: null,
  };

  const session: MiningSession = {
    id: "sess_none",
    isActive: false,
    startTime: null,
    endTime: null,
    baseRate: BASE_MINING_RATE_PER_SEC, // per-sec rate used by your old UI math
    streakMultiplier: 1,
    boostMultiplier: 1,
    purchaseMultiplier: 1,
    effectiveRate: BASE_MINING_RATE_PER_SEC,
    status: "ended",

    // ✅ REQUIRED by your updated types
    sessionMined: 0,

    // Optional fields some of your newer code added over time (safe to keep)
    startedAt: null,
    lastAccruedAt: null,
    baseRatePerHr: 0,
    multiplier: 1,
  };

  return {
    user: {
      id: uid("user"),
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: now,
      guest: true,
      riskScore: 0,
      referralCode: uid("ref").slice(0, 10),
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
    },
    streak,
    session,
    activeBoosts: [] as ActiveBoost[],
    ledger: [] as LedgerEntry[],
    purchaseHistory: [],
    notifications: [] as AppNotification[],

    walletAddress: null,
    walletVerifiedAt: null,
    currentNonce: null,

    // If your AppState was extended elsewhere, keep extra fields here if needed
    authed: false as any,
    wallet: { address: null, verified: false, verifiedAt: null } as any,
  } as any;
}

/**
 * Recompute effective rate based on streak + boosts + purchases.
 * In your older UI, effectiveRate is per-second.
 */
export function recomputeEffectiveRate(state: AppState) {
  const streakMult = state.session.streakMultiplier || 1;
  const boostMult = state.session.boostMultiplier || 1;
  const purchaseMult = state.session.purchaseMultiplier || 1;

  state.session.effectiveRate = state.session.baseRate * streakMult * boostMult * purchaseMult;
}

/**
 * Start a mining session locally (legacy mode).
 * NOTE: Your server DB routes do real accrual now; this is only to keep old code compiling.
 */
export function startSession(state: AppState) {
  const now = nowMs();
  const streakMult = getStreakMultiplier((state.streak?.currentStreak ?? 0) + 1);

  const session: MiningSession = {
    id: uid("sess"),
    isActive: true,
    startTime: now,
    endTime: now + SESSION_DURATION_MS,
    baseRate: BASE_MINING_RATE_PER_SEC,
    streakMultiplier: streakMult,
    boostMultiplier: state.session.boostMultiplier || 1,
    purchaseMultiplier: state.session.purchaseMultiplier || 1,
    effectiveRate: 0,
    status: "active",

    // ✅ REQUIRED
    sessionMined: 0,

    // Optional compatibility fields
    startedAt: now,
    lastAccruedAt: now,
    baseRatePerHr: 1,
    multiplier: streakMult,
  };

  state.session = session;

  state.streak.lastSessionStartAt = now;
  recomputeEffectiveRate(state);

  // Ledger event
  state.ledger.push({
    id: uid("led"),
    timestamp: now,
    deltaEcho: 0,
    reason: "session_start",
    sessionId: session.id,
    hash: fakeHash(),
  });

  return state;
}

/**
 * Tick: accrue locally based on elapsed time.
 * (Legacy) Your server refresh route does this now, but older UI may still call tick().
 */
export function tick(state: AppState, now: number = nowMs()) {
  if (!state.session?.isActive || !state.session.startTime || !state.session.endTime) return state;

  const end = state.session.endTime;
  const effectiveNow = Math.min(now, end);

  // Track lastAccruedAt for smooth accrual (fallback to startTime)
  const last =
    (state.session as any).lastAccruedAt != null
      ? new Date((state.session as any).lastAccruedAt).getTime()
      : state.session.startTime;

  const deltaSec = Math.max(0, (effectiveNow - last) / 1000);

  recomputeEffectiveRate(state);

  const earned = deltaSec * (state.session.effectiveRate || 0);

  // ✅ Keep both balances aligned for old UI
  state.user.balance += earned;
  state.user.totalMined += earned;

  // ✅ REQUIRED field updated
  state.session.sessionMined = (state.session.sessionMined || 0) + earned;

  // update lastAccruedAt compatibility
  (state.session as any).lastAccruedAt = new Date(effectiveNow).toISOString();

  if (effectiveNow >= end) {
    state.session.isActive = false;
    state.session.status = "ended";
    state.streak.lastSessionEndAt = end;

    // ledger settlement
    state.ledger.push({
      id: uid("led"),
      timestamp: effectiveNow,
      deltaEcho: earned,
      reason: "session_settlement",
      sessionId: state.session.id,
      hash: fakeHash(),
    });

    // notification
    state.notifications.push({
      id: uid("notif"),
      type: "session_end",
      title: "Mining Complete",
      body: `Session ended. +${earned.toFixed(6)} ECHO`,
      createdAt: effectiveNow,
      readAt: null,
    } as any);
  }

  return state;
}

/**
 * Apply an ad boost locally (legacy).
 */
export function activateAdBoost(state: AppState, multiplier: number = 2, durationMs: number = 10 * 60 * 1000) {
  const now = nowMs();
  const boost: ActiveBoost = {
    id: uid("boost"),
    type: "AD",
    multiplier,
    startAt: now,
    expiresAt: now + durationMs,
  };

  state.activeBoosts = [...(state.activeBoosts ?? []), boost];
  state.session.boostMultiplier = multiplier;
  recomputeEffectiveRate(state);

  state.ledger.push({
    id: uid("led"),
    timestamp: now,
    deltaEcho: 0,
    reason: "boost_activation",
    hash: fakeHash(),
  });

  return state;
}

/**
 * Clear expired boosts (legacy).
 */
export function pruneBoosts(state: AppState, now: number = nowMs()) {
  const boosts = state.activeBoosts ?? [];
  const active = boosts.filter((b) => b.expiresAt > now);

  state.activeBoosts = active;

  // If no ad boosts remain, reset boostMultiplier
  const anyBoost = active.find((b) => b.type === "AD");
  state.session.boostMultiplier = anyBoost ? anyBoost.multiplier : 1;

  recomputeEffectiveRate(state);
  return state;
}