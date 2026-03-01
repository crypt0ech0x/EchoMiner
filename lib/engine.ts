// lib/engine.ts
import crypto from "crypto";
import type { AppState, ActiveBoost, LedgerEntry, MiningSession } from "./types";

/**
 * NOTE:
 * This "engine" is only for the legacy/local-state routes (boost/store/snapshot).
 * Your mining accrual is now server-truth in DB via /api/mining/start + /api/mining/refresh.
 *
 * So this engine should be:
 * - safe
 * - type-correct
 * - defensive (won't crash if fields are missing)
 */

const AD_BOOST_MULTIPLIER = 2;
const AD_BOOST_DURATION_MS = 15 * 60 * 1000; // 15 min (adjust as desired)

function uid(prefix = "id") {
  // works in node runtime (Vercel) + avoids Math.random collisions
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowMs(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : Date.now();
}

function safeNumber(n: any, fallback: number) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function computeActiveBoostMultiplier(state: AppState, at: number) {
  const boosts = Array.isArray(state.activeBoosts) ? state.activeBoosts : [];
  let mult = 1;

  for (const b of boosts) {
    const startAt = safeNumber(b.startAt, 0);
    const expiresAt = safeNumber(b.expiresAt, 0);
    if (startAt <= at && at <= expiresAt) {
      mult *= safeNumber(b.multiplier, 1);
    }
  }

  return mult;
}

/**
 * Recomputes session.effectiveRate based on:
 * - baseRate
 * - streakMultiplier
 * - boostMultiplier
 * - purchaseMultiplier
 */
export function recomputeEffectiveRate(state: AppState, at = Date.now()): AppState {
  const s = state.session;

  // If session missing, do nothing safely
  if (!s) return state;

  // Derived multipliers
  const streakMult = safeNumber(s.streakMultiplier, 1);
  const purchaseMult = safeNumber(s.purchaseMultiplier, 1);

  // If you model boosts in session.boostMultiplier, keep it in sync with activeBoosts.
  const boostMult = computeActiveBoostMultiplier(state, at);

  const baseRate = safeNumber(s.baseRate, 0); // your UI treats this as "per second"
  const effectiveRate = baseRate * streakMult * boostMult * purchaseMult;

  state.session = {
    ...s,
    boostMultiplier: boostMult,
    effectiveRate,
  };

  return state;
}

export class EchoEngine {
  /**
   * Adds a 2x Ad boost (or reuses if one already active) and recomputes effective rate.
   * Called by: /app/api/boost/activate/route.ts
   */
  static addAdBoost(state: AppState, at?: number): AppState {
    const now = nowMs(at);

    if (!Array.isArray(state.activeBoosts)) state.activeBoosts = [];

    // Optional: if there is already an active AD boost, just extend it instead of stacking
    const existing = state.activeBoosts.find(
      (b) => b.type === "AD" && safeNumber(b.startAt, 0) <= now && now <= safeNumber(b.expiresAt, 0)
    );

    if (existing) {
      existing.expiresAt = now + AD_BOOST_DURATION_MS;
    } else {
      const boost: ActiveBoost = {
        id: uid("boost"),
        type: "AD",
        multiplier: AD_BOOST_MULTIPLIER,
        startAt: now,
        expiresAt: now + AD_BOOST_DURATION_MS,
      };
      state.activeBoosts.push(boost);
    }

    // Ledger entry (optional, but your UI expects ledger array)
    if (!Array.isArray(state.ledger)) state.ledger = [];
    const entry: LedgerEntry = {
      id: uid("led"),
      timestamp: now,
      deltaEcho: 0,
      reason: "boost_activation",
      hash: uid("hash"),
    };
    state.ledger.push(entry);

    // Recompute effective rate
    return recomputeEffectiveRate(state, now);
  }

  /**
   * Creates a CSV snapshot for exporting.
   * Called by: /app/api/snapshot/route.ts
   */
  static snapshotCSV(state: AppState): string {
    const wallet = state.walletAddress ?? "";
    const verifiedAt = state.walletVerifiedAt ? new Date(state.walletVerifiedAt).toISOString() : "";
    const totalMined = safeNumber(state.user?.totalMined, 0);

    // Keep it simple; you can add more columns later
    const headers = ["userId", "username", "walletAddress", "walletVerifiedAt", "totalMined"];
    const row = [
      state.user?.id ?? "",
      state.user?.username ?? "",
      wallet,
      verifiedAt,
      String(totalMined),
    ];

    return `${headers.join(",")}\n${row.map(csvEscape).join(",")}\n`;
  }

  /**
   * Applies a store webhook / simulated Stripe purchase:
   * - optionally adds "STORE" boost
   * - optionally adds balance/topup
   * Called by: /app/api/store/webhook/route.ts
   */
  static applyStoreWebhook(state: AppState, sessionId: string, at?: number): AppState {
    const now = nowMs(at);

    if (!Array.isArray(state.purchaseHistory)) state.purchaseHistory = [];
    if (!Array.isArray(state.activeBoosts)) state.activeBoosts = [];
    if (!Array.isArray(state.ledger)) state.ledger = [];

    // Record purchase event (minimal)
    state.purchaseHistory.push({
      id: uid("purchase"),
      sessionId,
      createdAt: now,
    });

    // Example behavior: store purchase grants 1.5x for 7 days (edit as you like)
    const boost: ActiveBoost = {
      id: uid("boost"),
      type: "STORE",
      multiplier: 1.5,
      startAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      sourceRef: sessionId,
    };
    state.activeBoosts.push(boost);

    // Ledger entry
    const entry: LedgerEntry = {
      id: uid("led"),
      timestamp: now,
      deltaEcho: 0,
      reason: "purchase_topup",
      hash: uid("hash"),
    };
    state.ledger.push(entry);

    return recomputeEffectiveRate(state, now);
  }

  /**
   * Utility to ensure session object shape matches your MiningSession type
   * (including sessionMined + valid status union).
   * If you still have any legacy route creating a session, use this.
   */
  static ensureSessionShape(session: Partial<MiningSession>, now = Date.now()): MiningSession {
    const startTime = session.startTime ?? now;
    const endTime = session.endTime ?? now;

    return {
      id: session.id ?? uid("sess"),
      isActive: !!session.isActive,
      startTime,
      endTime,
      baseRate: safeNumber(session.baseRate, 0),
      streakMultiplier: safeNumber(session.streakMultiplier, 1),
      boostMultiplier: safeNumber(session.boostMultiplier, 1),
      purchaseMultiplier: safeNumber(session.purchaseMultiplier, 1),
      effectiveRate: safeNumber(session.effectiveRate, 0),
      status: (session.status === "active" || session.status === "ended" || session.status === "settled")
        ? session.status
        : (session.isActive ? "active" : "ended"),
      // IMPORTANT: fixes your "sessionMined is missing" compile error
      sessionMined: safeNumber((session as any).sessionMined, 0),
    };
  }
}

function csvEscape(v: string) {
  const s = String(v ?? "");
  // escape quotes + wrap if needed
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}