// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * Server /api/state response shape (your current app/api/state/route.ts)
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet?: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // Date serialized
  };
  user?: {
    totalMinedEcho: number;
  };
  session?: {
    isActive: boolean;
    startedAt: string | null;      // Date serialized
    lastAccruedAt: string | null;  // Date serialized
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // important for cookie auth on same-site
    credentials: "same-origin",
  });

  // Try to parse JSON even on errors
  const text = await res.text();
  const data = safeJsonParse<any>(text);

  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

function nowMs() {
  return Date.now();
}

function isoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Convert ApiState -> your existing AppState (lib/types.ts)
 * We preserve anything "legacy UI" expects using previous local state as a base.
 */
function apiToAppState(api: ApiState, prev: AppState | null): AppState {
  const wallet = api.wallet ?? { address: null, verified: false, verifiedAt: null };
  const session = api.session ?? {
    isActive: false,
    startedAt: null,
    lastAccruedAt: null,
    baseRatePerHr: 0,
    multiplier: 1,
    sessionMined: 0,
  };
  const user = api.user ?? { totalMinedEcho: 0 };

  // Start from previous state so your UI (tabs, profile, store, etc.) still has required fields.
  const base: AppState =
    prev ??
    ({
      user: {
        id: "guest",
        username: "Voyager",
        balance: 0,
        totalMined: 0,
        referrals: 0,
        joinedDate: nowMs(),
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
        emailVerified: false,
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
    } as AppState);

  // Map new server-truth values into your legacy state
  const totalMined = user.totalMinedEcho ?? 0;

  // Your UI's MiningSession type is legacy; we adapt from DB session fields
  const effectiveRatePerHr = (session.baseRatePerHr ?? 0) * (session.multiplier ?? 1);

  const next: AppState = {
    ...base,
    user: {
      ...base.user,
      totalMined, // ✅ your types.ts uses totalMined (NOT totalMinedEcho)
    },

    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt ? isoToMs(wallet.verifiedAt) : null,

    // Keep your legacy session fields filled enough not to crash
    session: {
      ...base.session,
      isActive: !!session.isActive,
      startTime: isoToMs(session.startedAt),
      endTime: null,
      baseRate: (session.baseRatePerHr ?? 0) / 3600, // legacy expects "per sec" sometimes; safe placeholder
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: effectiveRatePerHr / 3600, // per sec placeholder
      status: session.isActive ? "active" : "ended",
    },
  };

  return next;
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    return safeJsonParse<AppState>(localStorage.getItem(this.STORAGE_KEY));
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  },

  /**
   * ✅ NEW: always GET /api/state and convert to AppState
   */
  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  /**
   * Refresh mining session (server does the accrual in DB)
   */
  async refreshState(): Promise<AppState> {
    // call refresh endpoint, then re-fetch /api/state (single source of truth)
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return this.getState();
  },

  /**
   * Start session (server creates/updates MiningSession)
   * payload maps to your /api/mining/start route
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 10, // pick your default
        multiplier: payload?.multiplier ?? 1,
      }),
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
      body: JSON.stringify(updates),
    });
    return this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ id, all: action === "readAll" }),
    });
    return this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    return this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", { method: "POST" });
    return String(data?.csv ?? "");
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return String(data?.sessionId ?? "");
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return this.getState();
  },
};