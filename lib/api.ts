// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * Server shape from /api/state (DB-backed).
 * Keep this small and defensive so missing fields never crash the app.
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet?: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // ISO string or null
  };
  user?: {
    totalMinedEcho: number;
  };
  session?: {
    isActive: boolean;
    startedAt: string | null;     // ISO or null
    lastAccruedAt: string | null; // ISO or null
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";

/** No-generic-on-this: avoids “Untyped function calls may not accept type arguments.” */
async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);

  // Helpful error message (like 405, 500, etc.)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      msg = data?.error || data?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return res.json();
}

function loadLocal(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

function saveLocal(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Your UI expects a full AppState.
 * If server only returns wallet + totals + mining session,
 * we keep everything else from local/default so the UI doesn’t crash.
 */
function defaultState(): AppState {
  const now = Date.now();
  return {
    user: {
      id: "guest",
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: now,
      guest: true,
      riskScore: 0,
      referralCode: "VOYAGER",
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
      email: undefined,
      emailVerified: false,
      pfpUrl: undefined,
      priorityAirdrop: false,
      isAdmin: false,
    },
    streak: {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },
    session: {
      id: "session",
      isActive: false,
      startTime: null,
      endTime: null,
      baseRate: 0,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: 0,
      status: "ended",
    },
    activeBoosts: [],
    ledger: [],
    purchaseHistory: [],
    notifications: [],
    walletAddress: null,
    walletVerifiedAt: null,
    currentNonce: null,
  };
}

/**
 * Merge server truth into the UI AppState shape.
 * - Never assume api.wallet exists.
 * - Never assume api.session exists.
 */
function mergeApiIntoApp(api: ApiState, prev: AppState | null): AppState {
  const base = prev ?? defaultState();

  const walletAddress = api?.wallet?.address ?? null;
  const walletVerifiedAt =
    api?.wallet?.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null;

  // total mined from DB
  const totalMined = api?.user?.totalMinedEcho ?? base.user.totalMined ?? 0;

  // Session mapping
  const isActive = api?.session?.isActive ?? false;
  const startedAtMs = api?.session?.startedAt ? Date.parse(api.session.startedAt) : null;

  const baseRatePerHr = api?.session?.baseRatePerHr ?? 0;
  const multiplier = api?.session?.multiplier ?? 1;

  // Your UI uses effectiveRate as "per second" in sessionEarnings math.
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;
  const baseRatePerSec = baseRatePerHr / 3600;

  return {
    ...base,

    // --- user ---
    user: {
      ...base.user,
      totalMined,
    },

    // --- wallet fields your UI already uses ---
    walletAddress,
    walletVerifiedAt,

    // --- mining session ---
    session: {
      ...base.session,
      isActive,
      startTime: startedAtMs,
      // optional: if your server session is 3 hours fixed, you can compute:
      endTime: startedAtMs ? startedAtMs + 3 * 60 * 60 * 1000 : null,
      baseRate: baseRatePerSec,
      effectiveRate: effectiveRatePerSec,
      // keep your multipliers from local UI if you want, but these are server truth:
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      status: isActive ? "active" : "ended",
    },
  };
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal,
  saveLocal,

  /**
   * Use GET now (your /api/state supports GET).
   */
  async getState(): Promise<AppState> {
    const prev = loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const merged = mergeApiIntoApp(api, prev);
    saveLocal(merged);
    return merged;
  },

  /**
   * Calls DB refresh route (cookie-auth). Returns merged AppState.
   * NOTE: your /api/mining/refresh currently ignores body. Keep it simple.
   */
  async refreshState(): Promise<AppState> {
    // Refresh mining on server
    await fetchJson("/api/mining/refresh", { method: "POST" });

    // Then re-fetch state truth
    return this.getState();
  },

  /**
   * Start mining with payload that matches your DB start route.
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr = payload?.baseRatePerHr ?? 30; // pick your default
    const multiplier = payload?.multiplier ?? 1;

    await fetchJson("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    return this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await fetchJson("/api/boost/activate", { method: "POST" });
    return this.getState();
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    await fetchJson("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        all: action === "readAll",
      }),
    });
    return this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    return this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = (await fetchJson("/api/snapshot", { method: "POST" })) as { csv: string };
    return data.csv;
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = (await fetchJson("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    })) as { sessionId: string };
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return this.getState();
  },
};