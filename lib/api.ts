// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * Server response shape from /api/state (your new DB-backed endpoint)
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
    startedAt: string | null;     // ISO
    lastAccruedAt: string | null; // ISO
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";

/**
 * Helper: safe JSON fetch with good errors (does NOT use generics on `this.*`)
 */
async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    // cookies are required for your session auth
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    // Try to parse a JSON error, but fall back to status text
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status})${text ? `: ${text}` : ""}`);
  }

  // Some routes might return empty body; handle it
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

/**
 * Build an AppState that satisfies your existing UI types.
 * We keep your old "big" AppState but source truth is DB.
 *
 * NOTE: This assumes your UI still uses the old structure in lib/types.ts.
 * If you later simplify your types, simplify this mapping too.
 */
function toAppState(api: ApiState, prev: AppState | null): AppState {
  // Keep as much of the previous UI state as possible (notifications, ledger, etc.)
  const base = prev ?? ({
    user: {
      id: "guest",
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: Date.now(),
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

  const startedAtMs = api.session.startedAt ? Date.parse(api.session.startedAt) : null;

  return {
    ...base,

    // --- wallet ---
    walletAddress: api.wallet.address,
    walletVerifiedAt: api.wallet.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,

    // --- user ---
    user: {
      ...base.user,
      // Your UI type uses totalMined, so map DB totalMinedEcho -> totalMined
      totalMined: api.user.totalMinedEcho ?? 0,
      guest: !api.authed,
    },

    // --- session (UI expects MiningSession shape) ---
    session: {
      ...base.session,
      isActive: api.session.isActive,
      startTime: startedAtMs,
      // If you want, compute an endTime as startedAt + 3 hours. (Your API enforces this.)
      endTime: startedAtMs ? startedAtMs + 3 * 60 * 60 * 1000 : null,
      baseRate: api.session.baseRatePerHr ?? 0,
      streakMultiplier: 1,
      boostMultiplier: api.session.multiplier ?? 1,
      purchaseMultiplier: 1,
      effectiveRate: (api.session.baseRatePerHr ?? 0) * (api.session.multiplier ?? 1),
      status: api.session.isActive ? "active" : "ended",
    },
  };
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      return null;
    }
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  },

  /**
   * Always fetches server truth and merges into your AppState shape.
   */
  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const merged = toAppState(api, prev);
    this.saveLocal(merged);
    return merged;
  },

  /**
   * Calls mining/refresh then refetches /api/state for a consistent shape.
   * (Prevents UI from crashing if refresh returns a different JSON shape.)
   */
  async refreshState(): Promise<AppState> {
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  /**
   * Starts a mining session. Your server uses cookie auth now.
   * payload is optional (you can wire baseRatePerHr later).
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 10, // pick a sane default for now
        multiplier: payload?.multiplier ?? 1,
      }),
    });
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await fetchJson("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

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

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ action, id }),
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

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", { method: "POST" });
    return (data?.csv ?? "") as string;
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return (data?.sessionId ?? "") as string;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};