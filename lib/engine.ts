// lib/engine.ts
import crypto from "crypto";
import type {
  AppState,
  ActiveBoost,
  LedgerEntry,
  NotificationType,
  AppNotification,
} from "@/lib/types";

/**
 * This file exists to support legacy "state-based" endpoints:
 * - /api/boost/activate
 * - /api/snapshot
 * - /api/store/webhook
 *
 * Your mining itself is now DB-backed, but these routes still rely on a
 * pure function that takes AppState and returns a new AppState.
 *
 * IMPORTANT: We ensure `state.session.sessionMined` always exists because your
 * MiningSession type now requires it.
 */

const now = () => Date.now();

function uid(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function safeArray<T>(v: any, fallback: T[] = []): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}

function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Recompute effectiveRate based on session + boosts (keeps UI consistent) */
export function recomputeEffectiveRate(state: AppState): number {
  const baseRate = safeNumber(state.session?.baseRate, 0);

  const streakMult = safeNumber(state.session?.streakMultiplier, 1);
  const purchaseMult = safeNumber(state.session?.purchaseMultiplier, 1);
  const boostMult = safeNumber(state.session?.boostMultiplier, 1);

  // effectiveRate is "ECHO per second" in your UI (MineTab uses effectiveRate * 3600)
  // If your baseRate is already per second, leave it as-is.
  // If your baseRate is per second in the UI, this is correct.
  return baseRate * streakMult * purchaseMult * boostMult;
}

function normalizeState(prev: AppState): AppState {
  const s = { ...prev };

  // --- normalize wallet-ish fields (legacy) ---
  if (typeof s.walletAddress === "undefined") s.walletAddress = null;
  if (typeof s.walletVerifiedAt === "undefined") s.walletVerifiedAt = null;
  if (typeof s.currentNonce === "undefined") s.currentNonce = null;

  // --- normalize arrays ---
  s.activeBoosts = safeArray<ActiveBoost>(s.activeBoosts, []);
  s.ledger = safeArray<LedgerEntry>(s.ledger, []);
  s.purchaseHistory = safeArray<any>(s.purchaseHistory, []);
  s.notifications = safeArray<AppNotification>(s.notifications, []);

  // --- normalize user ---
  s.user = {
    ...s.user,
    balance: safeNumber(s.user?.balance, 0),
    totalMined: safeNumber(s.user?.totalMined, 0),
    referrals: safeNumber(s.user?.referrals, 0),
    riskScore: safeNumber(s.user?.riskScore, 0),
    notificationPreferences: s.user?.notificationPreferences ?? {
      session_end: true,
      streak_grace_warning: true,
      boost_expired: true,
      weekly_summary: true,
      airdrop_announcement: true,
    },
  };

  // --- normalize streak ---
  s.streak = s.streak ?? {
    currentStreak: 0,
    lastSessionStartAt: null,
    lastSessionEndAt: null,
    graceEndsAt: null,
  };

  // --- normalize session ---
  s.session = {
    ...s.session,
    id: s.session?.id ?? uid("sess"),
    isActive: !!s.session?.isActive,
    startTime: s.session?.startTime ?? null,
    endTime: s.session?.endTime ?? null,

    // These are YOUR legacy fields from types.ts
    baseRate: safeNumber(s.session?.baseRate, 0), // "per second" in UI
    streakMultiplier: safeNumber(s.session?.streakMultiplier, 1),
    boostMultiplier: safeNumber(s.session?.boostMultiplier, 1),
    purchaseMultiplier: safeNumber(s.session?.purchaseMultiplier, 1),

    effectiveRate: safeNumber(s.session?.effectiveRate, 0),
    status: (s.session?.status ?? "ended") as "active" | "ended" | "settled",

    // ✅ REQUIRED now per your build error
    sessionMined: safeNumber((s.session as any)?.sessionMined, 0),
  };

  // keep effectiveRate consistent
  s.session.effectiveRate = recomputeEffectiveRate(s);

  return s;
}

function addLedger(state: AppState, entry: Omit<LedgerEntry, "id" | "timestamp" | "hash">): AppState {
  const ts = now();
  const id = uid("led");
  const hash = sha256Hex(`${id}:${ts}:${entry.reason}:${entry.deltaEcho}:${entry.sessionId ?? ""}`);

  const next: AppState = {
    ...state,
    ledger: [
      ...safeArray<LedgerEntry>(state.ledger, []),
      {
        id,
        timestamp: ts,
        deltaEcho: entry.deltaEcho,
        reason: entry.reason,
        sessionId: entry.sessionId,
        hash,
      },
    ],
  };

  return next;
}

function addNotification(state: AppState, notif: Omit<AppNotification, "id" | "createdAt" | "readAt">): AppState {
  const ts = now();
  const id = uid("notif");

  const next: AppState = {
    ...state,
    notifications: [
      ...safeArray<AppNotification>(state.notifications, []),
      {
        id,
        type: notif.type,
        title: notif.title,
        body: notif.body,
        actionUrl: notif.actionUrl,
        createdAt: ts,
        readAt: null,
      },
    ],
  };

  return next;
}

function pruneExpiredBoosts(state: AppState): AppState {
  const t = now();
  const boosts = safeArray<ActiveBoost>(state.activeBoosts, []);

  const still = boosts.filter((b) => safeNumber(b.expiresAt, 0) > t);
  const removed = boosts.length - still.length;

  let next = { ...state, activeBoosts: still };

  // Update boostMultiplier based on remaining boosts
  const maxBoost = still.reduce((m, b) => Math.max(m, safeNumber(b.multiplier, 1)), 1);
  next.session = { ...next.session, boostMultiplier: maxBoost };
  next.session.effectiveRate = recomputeEffectiveRate(next);

  if (removed > 0) {
    // Optional notification on expiration
    next = addNotification(next, {
      type: "boost_expired",
      title: "Boost expired",
      body: "Your mining boost has expired.",
    });
  }

  return next;
}

export class EchoEngine {
  /** Activate ad boost (2x for 30 minutes by default) */
  static activateAdBoost(prev: AppState): AppState {
    let state = normalizeState(prev);
    state = pruneExpiredBoosts(state);

    const t = now();
    const durationMs = 30 * 60 * 1000;
    const boost: ActiveBoost = {
      id: uid("boost"),
      type: "AD",
      multiplier: 2,
      startAt: t,
      expiresAt: t + durationMs,
    };

    const boosts = [...state.activeBoosts, boost];
    const maxBoost = boosts.reduce((m, b) => Math.max(m, safeNumber(b.multiplier, 1)), 1);

    state = {
      ...state,
      activeBoosts: boosts,
      session: {
        ...state.session,
        boostMultiplier: maxBoost,
      },
    };

    state.session.effectiveRate = recomputeEffectiveRate(state);

    state = addLedger(state, {
      deltaEcho: 0,
      reason: "boost_activation",
      sessionId: state.session.id,
    });

    state = addNotification(state, {
      type: "boost_expired",
      title: "Boost activated",
      body: "2x mining speed active for 30 minutes.",
    });

    return state;
  }

  /**
   * Store webhook simulation:
   * - treat `sessionId` as a "payment proof"
   * - apply a purchase multiplier or add balance, depending on your store item system
   *
   * This keeps your existing StoreTab happy without needing Stripe fully.
   */
  static handleStripeWebhook(prev: AppState, sessionId: string): AppState {
    let state = normalizeState(prev);
    state = pruneExpiredBoosts(state);

    // If you want: interpret sessionId like "mul_150" or "echo_25"
    // For now: apply a 1.5x purchaseMultiplier for 7 days
    const t = now();
    const durationMs = 7 * 24 * 60 * 60 * 1000;

    const purchaseBoost: ActiveBoost = {
      id: uid("boost"),
      type: "STORE",
      multiplier: 1.5,
      startAt: t,
      expiresAt: t + durationMs,
      sourceRef: sessionId,
    };

    const boosts = [...state.activeBoosts, purchaseBoost];

    // purchaseMultiplier is tracked separately from boostMultiplier in your types
    const maxPurchase = boosts
      .filter((b) => b.type === "STORE")
      .reduce((m, b) => Math.max(m, safeNumber(b.multiplier, 1)), 1);

    state = {
      ...state,
      activeBoosts: boosts,
      session: {
        ...state.session,
        purchaseMultiplier: maxPurchase,
      },
    };

    state.session.effectiveRate = recomputeEffectiveRate(state);

    state = addLedger(state, {
      deltaEcho: 0,
      reason: "purchase_topup",
      sessionId: state.session.id,
    });

    return state;
  }

  /** Build a simple snapshot CSV from state (for your admin/export button) */
  static getSnapshotCSV(prev: AppState): string {
    const state = normalizeState(prev);

    // Very basic; you can expand later
    const rows = [
      ["userId", "username", "totalMined", "walletAddress", "walletVerifiedAt"].join(","),
      [
        state.user.id,
        JSON.stringify(state.user.username ?? ""),
        String(safeNumber(state.user.totalMined, 0)),
        JSON.stringify(state.walletAddress ?? ""),
        state.walletVerifiedAt ? String(state.walletVerifiedAt) : "",
      ].join(","),
    ];

    return rows.join("\n");
  }
}