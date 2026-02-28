// lib/api.ts
import { AppState, NotificationPreferences } from "./types";

/**
 * EchoAPI
 * - Keeps your existing client AppState shape (lib/types.ts)
 * - Reads/writes localStorage
 * - Calls server routes (which now use session cookie + DB)
 * - Safely merges server "ApiState" into AppState so the UI doesn't crash
 */

// This matches what your /api/state returns right now (from your route.ts)
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // ISO date or null
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null;
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  // ---------- Local storage ----------
  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      return null;
    }
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  },

  // ---------- Network helper (NO generics to avoid TS "type arguments" errors) ----------
  async fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg =
        (data && (data.error || data.message)) ||
        `${init?.method ?? "GET"} ${url} failed (${res.status})`;
      throw new Error(msg);
    }

    return data;
  },

  // ---------- Default state scaffold (prevents "Initializing..." forever) ----------
  defaultState(): AppState {
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
  },

  // ---------- Merge server ApiState into your AppState ----------
  apiToAppState(api: ApiState | null, prev: AppState | null): AppState {
    const base = prev ?? this.defaultState();

    // If server response is missing/invalid, just return base (don’t crash)
    if (!api || typeof api !== "object" || api.ok !== true) return base;

    const walletAddress = api.wallet?.address ?? null;
    const walletVerifiedAt = api.wallet?.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null;
    const totalMinedEcho = Number(api.user?.totalMinedEcho ?? 0);

    // Keep your existing UI fields, but make them reflect server truth
    const next: AppState = {
      ...base,

      user: {
        ...base.user,
        // Your UI expects user.totalMined (not totalMinedEcho)
        totalMined: totalMinedEcho,
        guest: !api.authed,
      },

      // Keep your existing session shape; server session is DB-backed and different.
      // For now we only reflect isActive (so the UI knows it’s running).
      session: {
        ...base.session,
        isActive: !!api.session?.isActive,
      },

      walletAddress,
      walletVerifiedAt,
    };

    return next;
  },

  // ---------- Core calls ----------
  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    let api: ApiState | null = null;

    try {
      api = (await this.fetchJson("/api/state", { method: "GET" })) as ApiState;
    } catch {
      // If /api/state fails, still return local/default so UI loads
      const fallback = prev ?? this.defaultState();
      this.saveLocal(fallback);
      return fallback;
    }

    const next = this.apiToAppState(api, prev);
    this.saveLocal(next);
    return next;
  },

  async refreshState(): Promise<AppState> {
    // With server truth, refresh just re-gets /api/state, then calls /api/mining/refresh (server accrues)
    const state = await this.getState();

    try {
      await this.fetchJson("/api/mining/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // ignore refresh failure; still return state
    }

    // Pull fresh server truth after refresh
    const after = await this.getState();
    return after;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    // You moved start to DB cookie auth, so don’t send {state} anymore.
    const baseRatePerHr = Number(payload?.baseRatePerHr ?? 10);
    const multiplier = Number(payload?.multiplier ?? 1);

    await this.fetchJson("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await this.fetchJson("/api/boost/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    return await this.getState();
  },

  // ---------- Profile ----------
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    await this.fetchJson("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await this.fetchJson("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    return await this.getState();
  },

  // ---------- Notifications ----------
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await this.fetchJson("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, all: action === "readAll" }),
    });

    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await this.fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });

    return await this.getState();
  },

  // ---------- Snapshot export ----------
  async getSnapshotCSV(): Promise<string> {
    const data = await this.fetchJson("/api/snapshot", { method: "POST" });
    return String(data?.csv ?? "");
  },

  // ---------- Store / Stripe ----------
  async createStripeSession(itemId: string): Promise<string> {
    const data = await this.fetchJson("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });

    return String(data?.sessionId ?? "");
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await this.fetchJson("/api/store/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    return await this.getState();
  },
};