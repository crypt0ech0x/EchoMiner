// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * Server state shape returned by /api/state (your current route.ts)
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // ISO string or null
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null; // ISO string or null
    lastAccruedAt: string | null; // ISO string or null
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";
const SESSION_DURATION_SECONDS = 60 * 60 * 3; // must match your API routes

function nowMs() {
  return Date.now();
}

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function loadLocal(): AppState | null {
  if (typeof window === "undefined") return null;
  return safeJsonParse<AppState>(localStorage.getItem(STORAGE_KEY));
}

function saveLocal(state: AppState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // IMPORTANT for cookie-based auth
    credentials: "include",
  });

  if (!res.ok) {
    // Make errors visible + useful (e.g. "getState failed (405)")
    const text = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${url} failed (${res.status}) ${text}`.trim());
  }

  return (await res.json()) as T;
}

/**
 * Your UI expects a BIG AppState. Your backend /api/state currently returns a SMALL one.
 * This creates a safe "full" AppState so the app doesn't crash while you gradually
 * migrate endpoints to DB-backed versions.
 */
function makeDefaultAppState(): AppState {
  const t = nowMs();
  return {
    user: {
      id: "guest",
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: t,
      guest: true,
      riskScore: 0,
      referralCode: "VOYAGER",
      isAdmin: false,
      priorityAirdrop: false,
      pfpUrl: undefined,
      email: undefined,
      emailVerified: false,
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
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
      effectiveRate: 0, // (ECHO per second) per your UI math usage
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
 * Convert ApiState -> AppState (merge into previous local state so you don't lose UI-only fields)
 */
function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const base = prev ?? makeDefaultAppState();

  const startedAtMs = api.session.startedAt ? Date.parse(api.session.startedAt) : null;

  // Your UI seems to treat effectiveRate as "per second"
  const effectiveRatePerSec =
    (Number(api.session.baseRatePerHr ?? 0) * Number(api.session.multiplier ?? 1)) / 3600;

  const endTimeMs = startedAtMs ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  return {
    ...base,

    // --- user ---
    user: {
      ...base.user,
      // Keep your UI's field name: totalMined
      totalMined: Number(api.user.totalMinedEcho ?? 0),
      guest: !api.authed,
    },

    // --- session (match your lib/types.ts MiningSession) ---
    session: {
      ...base.session,
      isActive: !!api.session.isActive,
      startTime: startedAtMs,
      endTime: api.session.isActive ? endTimeMs : endTimeMs, // ok either way
      baseRate: Number(api.session.baseRatePerHr ?? 0), // UI expects "baseRate" (per hour)
      streakMultiplier: base.session.streakMultiplier ?? 1,
      boostMultiplier: base.session.boostMultiplier ?? 1,
      purchaseMultiplier: base.session.purchaseMultiplier ?? 1,
      effectiveRate: Number.isFinite(effectiveRatePerSec) ? effectiveRatePerSec : 0,
      status: api.session.isActive ? "active" : "ended",
    },

    // --- wallet fields your UI uses ---
    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: api.wallet?.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,
  };
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal,
  saveLocal,

  /**
   * Get state from server (cookie-auth) + merge into local UI state
   */
  async getState(): Promise<AppState> {
    const prev = loadLocal();
    const api = await fetchJson<ApiState>("/api/state", { method: "GET" });
    const app = apiToAppState(api, prev);
    saveLocal(app);
    return app;
  },

  /**
   * Mining refresh: your route currently expects POST with no body.
   * We'll POST, then re-fetch /api/state (authoritative).
   */
  async refreshState(): Promise<AppState> {
    await fetchJson<{ ok: boolean }>("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  /**
   * Start mining session: your route expects { baseRatePerHr, multiplier? }
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const body = {
      baseRatePerHr: payload?.baseRatePerHr ?? 12, // pick a sensible default if your UI didn't pass one
      multiplier: payload?.multiplier ?? 1,
    };
    await fetchJson("/api/mining/start", { method: "POST", body: JSON.stringify(body) });
    return await this.getState();
  },

  /**
   * If you still have /api/boost/activate, keep it.
   * If not implemented yet, this will show a helpful error.
   */
  async activateAdBoost(): Promise<AppState> {
    await fetchJson("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

  // ---------- Profile ----------
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    await fetchJson("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  // ---------- Notifications ----------
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ id, all: action === "readAll" }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    return await this.getState();
  },

  // ---------- Snapshot export ----------
  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson<{ csv: string }>("/api/snapshot", { method: "POST" });
    return data.csv;
  },

  // ---------- Store / Stripe ----------
  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson<{ sessionId: string }>("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};