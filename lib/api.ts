// lib/api.ts
import type { AppState, ApiState, NotificationPreferences } from "./types";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function defaults(): AppState {
  return {
    user: {
      id: "guest",
      username: "Guest",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: Date.now(),
      guest: true,
      riskScore: 0,
      referralCode: "ECHO",
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
      sessionMined: 0,
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

function normalize(api: any, prev: AppState | null): AppState {
  const base = prev ?? defaults();

  // If server returned the new ApiState shape, map it.
  const isApiState =
    api && typeof api === "object" && typeof api.ok === "boolean" && api.wallet && api.user && api.session;

  if (!isApiState) {
    // If your server still returns legacy AppState sometimes, just merge safely.
    return { ...base, ...(api as Partial<AppState>) };
  }

  const s = api as ApiState;

  const total = Number(s.user?.totalMinedEcho ?? 0) || 0;
  const sessionMined = Number(s.session?.sessionMined ?? 0) || 0;

  return {
    ...base,

    // carry flags for debugging/UI
    ok: s.ok,
    authed: s.authed,
    wallet: s.wallet,

    // user
    user: {
      ...base.user,
      guest: !s.authed,
      totalMined: total, // keep old field alive
      totalMinedEcho: total,
    },

    // wallet (old UI fields)
    walletAddress: s.wallet?.address ?? null,
    walletVerifiedAt: s.wallet?.verifiedAt ? Date.parse(s.wallet.verifiedAt) : null,

    // session (old UI fields)
    session: {
      ...base.session,
      isActive: !!s.session?.isActive,
      // old UI expects milliseconds timestamps; server sends ISO strings
      startTime: s.session?.startedAt ? Date.parse(s.session.startedAt) : null,
      endTime: null,
      baseRate: Number(s.session?.baseRatePerHr ?? 0) || 0,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: Number(s.session?.baseRatePerHr ?? 0) * Number(s.session?.multiplier ?? 1),
      status: s.session?.isActive ? "active" : "ended",
      sessionMined,
    },
  };
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState {
    if (typeof window === "undefined") return defaults();
    return safeJsonParse<AppState>(localStorage.getItem(this.STORAGE_KEY)) ?? defaults();
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  },

  async getState(): Promise<AppState> {
    const prev = typeof window !== "undefined" ? this.loadLocal() : null;

    // Use GET so /api/state works even if POST is blocked/changed
    const res = await fetch("/api/state", { method: "GET" });
    if (!res.ok) throw new Error(`getState failed (${res.status})`);

    const api = await res.json();
    const next = normalize(api, prev);
    this.saveLocal(next);
    return next;
  },

  async refreshState(): Promise<AppState> {
    const res = await fetch("/api/mining/refresh", { method: "POST" });
    const api = await res.json();
    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 1,
        multiplier: payload?.multiplier ?? 1,
      }),
    });

    const api = await res.json();
    if (!res.ok) throw new Error(api?.error || api?.message || "Failed to start session");

    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", { method: "POST" });
    const api = await res.json();
    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    const api = await res.json();
    if (!res.ok) throw new Error(api?.error || api?.message || "Profile update failed");

    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const res = await fetch("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const api = await res.json();
    if (!res.ok) throw new Error(api?.error || api?.message || "Email verification failed");

    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    const res = await fetch("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });

    const api = await res.json();
    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });

    const api = await res.json();
    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },

  async getSnapshotCSV(): Promise<string> {
    const res = await fetch("/api/snapshot", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Snapshot export failed");
    return data.csv as string;
  },

  async createStripeSession(itemId: string): Promise<string> {
    const res = await fetch("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Checkout failed");
    return data.sessionId as string;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const res = await fetch("/api/store/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const api = await res.json();
    const next = normalize(api, this.loadLocal());
    this.saveLocal(next);
    return next;
  },
};