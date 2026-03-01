// lib/engine.ts
import crypto from "crypto";
import type {
  AppState,
  ActiveBoost,
  LedgerEntry,
  MiningSession,
  NotificationPreferences,
  AppNotification,
} from "@/lib/types";

/**
 * This file exists to keep older "state-engine" API routes compiling
 * (boost/activate, snapshot, store/webhook) while you migrate mining to DB.
 *
 * It is purely deterministic + defensive: it will not throw on missing fields.
 */

// ----- Tunables (feel free to change) -----
const SESSION_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
const DEFAULT_BASE_RATE_PER_SEC = 1 / 3600; // 1 ECHO/hr -> per second
const AD_BOOST_MULTIPLIER = 2;
const AD_BOOST_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ----- Helpers -----
function nowMs(input?: number) {
  return typeof input === "number" && Number.isFinite(input) ? input : Date.now();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function id(prefix: string) {
  // crypto.randomUUID exists in modern runtimes; fall back for safety
  const rand =
    (crypto as any).randomUUID?.() ?? crypto.randomBytes(16).toString("hex");
  return `${prefix}_${rand}`;
}

function safePrefs(p?: any): NotificationPreferences {
  return {
    session_end: !!p?.session_end,
    streak_grace_warning: !!p?.streak_grace_warning,
    boost_expired: !!p?.boost_expired,
    weekly_summary: !!p?.weekly_summary,
    airdrop_announcement: !!p?.airdrop_announcement,
  };
}

function ensureArrays(state: any) {
  if (!state.activeBoosts) state.activeBoosts = [];
  if (!state.ledger) state.ledger = [];
  if (!state.purchaseHistory) state.purchaseHistory = [];
  if (!state.notifications) state.notifications = [];
}

function effectiveBoostMultiplier(activeBoosts: ActiveBoost[], t: number) {
  // multiply all currently-active boosts
  let mult = 1;
  for (const b of activeBoosts ?? []) {
    if (!b) continue;
    if (typeof b.multiplier !== "number") continue;
    if (t >= b.startAt && t < b.expiresAt) mult *= b.multiplier;
  }
  return mult;
}

function makeLedgerEntry(partial: Omit<LedgerEntry, "id" | "hash">): LedgerEntry {
  const raw = JSON.stringify(partial);
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return {
    id: id("ledg"),
    hash,
    ...partial,
  };
}

function normalizeSession(session: any, t: number): MiningSession {
  // Your app UI expects these fields. Also newer compilation errors indicate
  // sessionMined + lastAccruedAt are required now.
  const startTime = typeof session?.startTime === "number" ? session.startTime : null;
  const endTime = typeof session?.endTime === "number" ? session.endTime : null;

  const baseRate =
    typeof session?.baseRate === "number" && Number.isFinite(session.baseRate)
      ? session.baseRate
      : DEFAULT_BASE_RATE_PER_SEC;

  const streakMultiplier =
    typeof session?.streakMultiplier === "number" && Number.isFinite(session.streakMultiplier)
      ? session.streakMultiplier
      : 1;

  const boostMultiplier =
    typeof session?.boostMultiplier === "number" && Number.isFinite(session.boostMultiplier)
      ? session.boostMultiplier
      : 1;

  const purchaseMultiplier =
    typeof session?.purchaseMultiplier === "number" && Number.isFinite(session.purchaseMultiplier)
      ? session.purchaseMultiplier
      : 1;

  const effectiveRate =
    typeof session?.effectiveRate === "number" && Number.isFinite(session.effectiveRate)
      ? session.effectiveRate
      : baseRate * streakMultiplier * boostMultiplier * purchaseMultiplier;

  // Required by your newest TS error
  const sessionMined =
    typeof session?.sessionMined === "number" && Number.isFinite(session.sessionMined)
      ? session.sessionMined
      : 0;

  const lastAccruedAt =
    typeof session?.lastAccruedAt === "number" && Number.isFinite(session.lastAccruedAt)
      ? session.lastAccruedAt
      : startTime ?? null;

  const isActive = !!session?.isActive;

  // Must be union type, not string
  const status: MiningSession["status"] =
    session?.status === "active" || session?.status === "ended" || session?.status === "settled"
      ? session.status
      : isActive
        ? "active"
        : "ended";

  return {
    id: typeof session?.id === "string" ? session.id : id("sess"),
    isActive,
    startTime,
    endTime,
    baseRate,
    streakMultiplier,
    boostMultiplier,
    purchaseMultiplier,
    effectiveRate,
    status,

    // These extra fields are expected by your newer build errors
    sessionMined,
    lastAccruedAt,
  } as unknown as MiningSession;
}

/**
 * Recompute effectiveRate based on multipliers + active boosts.
 * (Your UI treats effectiveRate as ECHO-per-second.)
 */
export function recomputeEffectiveRate(state: AppState, t: number) {
  ensureArrays(state as any);

  const sess = normalizeSession((state as any).session, t);

  // Apply time-based boosts from activeBoosts
  const boostMult = effectiveBoostMultiplier((state as any).activeBoosts, t);

  const effectiveRate =
    sess.baseRate *
    (sess.streakMultiplier || 1) *
    (sess.purchaseMultiplier || 1) *
    boostMult;

  // keep the structured fields coherent
  (state as any).session = {
    ...sess,
    boostMultiplier: boostMult,
    effectiveRate,
  };

  return effectiveRate;
}

export class EchoEngine {
  /**
   * Start a mining session (local-engine version).
   * NOTE: Your DB routes can ignore this, but keeping it for routes still importing it.
   */
  static startSession(prev: AppState, t?: number): AppState {
    const now = nowMs(t);
    const state: any = structuredClone(prev) as any;
    ensureArrays(state);

    // Normalize user shape defensively
    state.user = state.user ?? {};
    state.user.notificationPreferences = safePrefs(state.user.notificationPreferences);

    const sess = normalizeSession(state.session, now);

    const startTime = now;
    const endTime = now + SESSION_DURATION_MS;

    // If already active, just return (no reset)
    if (sess.isActive && sess.startTime && sess.endTime && now < sess.endTime) {
      recomputeEffectiveRate(state, now);
      return state as AppState;
    }

    // Start fresh
    const fresh: any = {
      ...sess,
      isActive: true,
      startTime,
      endTime,
      status: "active" as const,
      sessionMined: 0,
      lastAccruedAt: now,
    };

    state.session = fresh;

    // Ledger event for session start
    state.ledger.push(
      makeLedgerEntry({
        timestamp: now,
        deltaEcho: 0,
        reason: "session_start",
        sessionId: fresh.id,
      })
    );

    // Recompute effective rate
    recomputeEffectiveRate(state, now);

    // Streak bookkeeping (minimal; you can enhance later)
    state.streak = state.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    };
    state.streak.lastSessionStartAt = now;

    return state as AppState;
  }

  /**
   * Accrue mined amount locally based on lastAccruedAt.
   * This is primarily for the legacy UI engine; DB-backed mining uses /api/mining/refresh.
   */
  static refresh(prev: AppState, t?: number): AppState {
    const now = nowMs(t);
    const state: any = structuredClone(prev) as any;
    ensureArrays(state);

    state.user = state.user ?? {};
    if (typeof state.user.balance !== "number") state.user.balance = 0;
    if (typeof state.user.totalMined !== "number") state.user.totalMined = 0;

    state.session = normalizeSession(state.session, now);
    recomputeEffectiveRate(state, now);

    const s = state.session as any;

    if (!s.isActive || !s.startTime || !s.endTime) return state as AppState;

    const effectiveNow = Math.min(now, s.endTime);
    const last = typeof s.lastAccruedAt === "number" ? s.lastAccruedAt : s.startTime;

    const deltaSec = clamp((effectiveNow - last) / 1000, 0, SESSION_DURATION_MS / 1000);
    if (deltaSec <= 0) return state as AppState;

    const earned = round6(deltaSec * (s.effectiveRate || 0));
    if (earned > 0) {
      state.user.balance = round6(state.user.balance + earned);
      state.user.totalMined = round6(state.user.totalMined + earned);
      s.sessionMined = round6((s.sessionMined || 0) + earned);
    }

    s.lastAccruedAt = effectiveNow;

    // End session if time is up
    if (effectiveNow >= s.endTime) {
      s.isActive = false;
      s.status = "ended" as const;

      state.streak = state.streak ?? {};
      state.streak.lastSessionEndAt = s.endTime;

      // Notification (optional)
      state.notifications.push({
        id: id("notif"),
        type: "session_end",
        title: "Mining session complete",
        body: `Session ended. Earned ${(s.sessionMined || 0).toFixed(4)} ECHO.`,
        createdAt: now,
        readAt: null,
      } satisfies AppNotification);

      // Ledger settlement entry
      state.ledger.push(
        makeLedgerEntry({
          timestamp: now,
          deltaEcho: round6(s.sessionMined || 0),
          reason: "session_settlement",
          sessionId: s.id,
        })
      );
    }

    state.session = s;
    return state as AppState;
  }

  /**
   * Add an Ad boost (2x for 15 minutes by default).
   */
  static addAdBoost(prev: AppState, t?: number): AppState {
    const now = nowMs(t);
    const state: any = structuredClone(prev) as any;
    ensureArrays(state);

    const boost: ActiveBoost = {
      id: id("boost"),
      type: "AD",
      multiplier: AD_BOOST_MULTIPLIER,
      startAt: now,
      expiresAt: now + AD_BOOST_DURATION_MS,
      sourceRef: "ad",
    };

    state.activeBoosts.push(boost);

    state.ledger.push(
      makeLedgerEntry({
        timestamp: now,
        deltaEcho: 0,
        reason: "boost_activation",
      })
    );

    recomputeEffectiveRate(state, now);
    return state as AppState;
  }

  /**
   * Process a "purchase" (used by your /api/store/webhook mock).
   * This applies a STORE boost if the purchaseHistory entry has a multiplier/duration.
   */
  static processPurchase(prev: AppState, sessionId: string, t?: number): AppState {
    const now = nowMs(t);
    const state: any = structuredClone(prev) as any;
    ensureArrays(state);

    // find purchase record
    const purchase = (state.purchaseHistory ?? []).find((p: any) => p?.id === sessionId);
    if (purchase) purchase.status = "succeeded";

    // If your StoreTab expects "itemId: explorer_echo" -> give 2x for 7 days as an example
    // Adjust this mapping to match your real items.
    const itemId = purchase?.itemId;
    if (itemId) {
      // Example mapping
      if (itemId === "explorer_echo") {
        const days = 7;
        state.activeBoosts.push({
          id: id("boost"),
          type: "STORE",
          multiplier: 1.25,
          startAt: now,
          expiresAt: now + days * 24 * 60 * 60 * 1000,
          sourceRef: sessionId,
        } satisfies ActiveBoost);

        state.ledger.push(
          makeLedgerEntry({
            timestamp: now,
            deltaEcho: 0,
            reason: "purchase_topup",
          })
        );
      }
    }

    recomputeEffectiveRate(state, now);
    return state as AppState;
  }

  /**
   * Snapshot CSV (used by /api/snapshot).
   */
  static getSnapshotCSV(state: AppState): string {
    return EchoEngine.snapshotCSV(state);
  }

  static snapshotCSV(state: AppState): string {
    const s: any = state as any;
    const wallet = s.walletAddress ?? "";
    const total = s.user?.totalMined ?? 0;

    // Minimal CSV; expand as needed
    const header = ["userId", "walletAddress", "totalMined"].join(",");
    const row = [s.user?.id ?? "", wallet, String(total)].join(",");
    return `${header}\n${row}\n`;
  }
}