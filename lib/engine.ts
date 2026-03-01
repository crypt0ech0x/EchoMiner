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
 * NOTE:
 * You moved mining to DB routes (/api/mining/start, /api/mining/refresh).
 * This engine is now only used by legacy routes like:
 *   - /api/boost/activate  (expects EchoEngine.addAdBoost)
 *   - /api/snapshot        (expects EchoEngine.getSnapshotCSV)
 *   - /api/store/webhook   (often expects a helper to apply purchases)
 *
 * So we keep it focused and compatible.
 */

function uid(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowMs() {
  return Date.now();
}

function addLedger(state: AppState, entry: Omit<LedgerEntry, "id" | "hash">): AppState {
  const id = uid("led");
  const hash = crypto.createHash("sha256").update(JSON.stringify({ id, ...entry })).digest("hex");

  const next: AppState = {
    ...state,
    ledger: [
      ...(state.ledger ?? []),
      {
        id,
        hash,
        ...entry,
      },
    ],
  };

  return next;
}

function addNotification(
  state: AppState,
  notif: Omit<AppNotification, "id" | "createdAt" | "readAt">
): AppState {
  const n: AppNotification = {
    id: uid("notif"),
    createdAt: nowMs(),
    readAt: null,
    ...notif,
  };

  return {
    ...state,
    notifications: [n, ...(state.notifications ?? [])],
  };
}

/**
 * Recomputes effectiveRate (ECHO per second) based on multipliers you already have in AppState.
 * Your MineTab uses session.effectiveRate heavily.
 */
export function recomputeEffectiveRate(state: AppState): AppState {
  const session = state.session;

  // baseRate in your types is "per second" in the UI math (MineTab uses effectiveRate * 3600).
  const baseRate = Number(session.baseRate ?? 0);

  const streakMult = Number(session.streakMultiplier ?? 1);
  const boostMult = Number(session.boostMultiplier ?? 1);
  const purchaseMult = Number(session.purchaseMultiplier ?? 1);

  const effectiveRate = baseRate * streakMult * boostMult * purchaseMult;

  return {
    ...state,
    session: {
      ...session,
      effectiveRate,
    },
  };
}

export class EchoEngine {
  /**
   * --- BOOST ---
   * Expected by: /app/api/boost/activate/route.ts
   * Usage: EchoEngine.addAdBoost(state, now)
   */
  static addAdBoost(state: AppState, now: number = nowMs()): AppState {
    const durationMs = 60 * 60 * 1000; // 1 hour boost (adjust if you want)
    const boost: ActiveBoost = {
      id: uid("boost"),
      type: "AD",
      multiplier: 2,
      startAt: now,
      expiresAt: now + durationMs,
    };

    const next: AppState = {
      ...state,
      activeBoosts: [boost, ...(state.activeBoosts ?? [])],
      session: {
        ...state.session,
        boostMultiplier: 2,
      },
    };

    const withRate = recomputeEffectiveRate(next);

    const withLedger = addLedger(withRate, {
      timestamp: now,
      deltaEcho: 0,
      reason: "boost_activation",
    });

    return addNotification(withLedger, {
      type: "boost_expired" as NotificationType,
      title: "Boost Activated",
      body: "2x mining boost active for 1 hour.",
    });
  }

  /**
   * Clears expired boosts and resets boostMultiplier if needed.
   * Call this on load or refresh if you want to keep state clean.
   */
  static pruneExpiredBoosts(state: AppState, now: number = nowMs()): AppState {
    const boosts = state.activeBoosts ?? [];
    const alive = boosts.filter((b) => b.expiresAt > now);

    const hadAdBoost = alive.some((b) => b.type === "AD");
    const boostMultiplier = hadAdBoost ? Math.max(...alive.filter(b => b.type === "AD").map(b => b.multiplier)) : 1;

    const next: AppState = {
      ...state,
      activeBoosts: alive,
      session: { ...state.session, boostMultiplier },
    };

    return recomputeEffectiveRate(next);
  }

  /**
   * --- SNAPSHOT CSV ---
   * Expected by: /app/api/snapshot/route.ts
   * Some of your code calls getSnapshotCSV(), other code calls snapshotCSV().
   * We provide BOTH to stop compile errors.
   */
  static snapshotCSV(state: AppState): string {
    const wallet = state.walletAddress ?? "";
    const mined = state.user?.totalMined ?? 0;

    const headers = ["walletAddress", "totalMined"];
    const rows = [[wallet, String(mined)]];

    return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  }

  static getSnapshotCSV(state: AppState): string {
    return EchoEngine.snapshotCSV(state);
  }

  /**
   * --- STORE / STRIPE WEBHOOK HELPERS ---
   * Expected by: /app/api/store/webhook/route.ts (commonly)
   * This is a "simulated" purchase apply. If you wire real Stripe later, keep the shape.
   */
  static applyPurchase(state: AppState, payload: { itemId: string; sessionId?: string; now?: number }): AppState {
    const now = payload.now ?? nowMs();

    // You can map itemId -> effects here. Keeping it simple:
    // - Example: itemId "mult_2x_7d" sets purchaseMultiplier to 2
    let purchaseMultiplier = state.session.purchaseMultiplier ?? 1;
    let deltaEcho = 0;

    if (payload.itemId.includes("mult_2x")) purchaseMultiplier = 2;
    if (payload.itemId.includes("mult_3x")) purchaseMultiplier = 3;
    if (payload.itemId.includes("topup_")) {
      // e.g. topup_100
      const amt = Number(payload.itemId.replace("topup_", ""));
      if (Number.isFinite(amt) && amt > 0) deltaEcho = amt;
    }

    let next: AppState = {
      ...state,
      session: {
        ...state.session,
        purchaseMultiplier,
      },
      purchaseHistory: [
        ...(state.purchaseHistory ?? []),
        { id: uid("purchase"), itemId: payload.itemId, sessionId: payload.sessionId ?? null, createdAt: now },
      ],
    };

    next = recomputeEffectiveRate(next);

    if (deltaEcho !== 0) {
      // credit balance immediately (legacy behavior)
      next = {
        ...next,
        user: { ...next.user, balance: (next.user.balance ?? 0) + deltaEcho },
      };

      next = addLedger(next, {
        timestamp: now,
        deltaEcho,
        reason: "purchase_topup",
      });
    }

    return next;
  }
}

function csvEscape(v: string) {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}