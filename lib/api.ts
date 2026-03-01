// lib/api.ts
import { AppState, WalletState, NotificationPreferences } from "./types";

type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null;
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

const STORAGE_KEY = "echo_miner_state_v1";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function defaultAppState(): AppState {
  const now = Date.now();
  return {
    authed: false,
    wallet: { address: null, verified: false, verifiedAt: null },

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
      id: "sess",
      isActive: false,

      // legacy UI fields
      startTime: null,
      endTime: null,
      baseRate: 0,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: 0,
      status: "ended",

      // server fields
      sessionMined: 0,
      lastAccruedAt: null,
      baseRatePerHr: 0,
      multiplier: 1,
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

function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const base = prev ?? defaultAppState();

  const wallet: WalletState = {
    address: api.wallet?.address ?? null,
    verified: !!api.wallet?.verified,
    verifiedAt: api.wallet?.verifiedAt ?? null,
  };

  const totalMinedEcho = Number(api.user?.totalMinedEcho ?? 0);

  // Server session fields (truth)
  const isActive = !!api.session?.isActive;
  const startedAtMs = api.session?.startedAt ? new Date(api.session.startedAt).getTime() : null;
  const lastAccruedAtMs = api.session?.lastAccruedAt ? new Date(api.session.lastAccruedAt).getTime() : null;

  const baseRatePerHr = Number(api.session?.baseRatePerHr ?? 0);
  const multiplier = Number(api.session?.multiplier ?? 1);
  const sessionMined = Number(api.session?.sessionMined ?? 0);

  // Your UI uses per-second effectiveRate
  const effectiveRatePerSec = baseRatePerHr > 0 ? (baseRatePerHr * multiplier) / 3600 : 0;

  // Your MineTab expects start/end time; your server uses a 3-hour session
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  const endTimeMs = startedAtMs ? startedAtMs + THREE_HOURS_MS : null;

  return {
    ...base,

    authed: !!api.authed,
    wallet,

    // keep legacy fields too (so old code doesn’t break)
    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt ? new Date(wallet.verifiedAt).getTime() : null,

    user: {
      ...base.user,
      totalMined: totalMinedEcho,
      // balance is what your UI shows as “wallet balance” / “ECHO balance”
      // keep it aligned with total mined for now
      balance: totalMinedEcho,
      guest: !api.authed,
    },

    session: {
      ...base.session,

      isActive,
      status: isActive ? "active" : "ended",

      // legacy fields for MineTab
      startTime: startedAtMs,
      endTime: endTimeMs,
      baseRate: baseRatePerHr / 3600, // per-sec base
      effectiveRate: effectiveRatePerSec,

      // server fields used for accurate display
      baseRatePerHr,
      multiplier,
      sessionMined,
      lastAccruedAt: lastAccruedAtMs,
    },
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    credentials: "include",
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    return safeJsonParse<AppState>(localStorage.getItem(STORAGE_KEY));
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // server accrues + returns current numbers
    const api = (await fetchJson("/api/mining/refresh", { method: "POST" })) as ApiState;
    const prev = this.loadLocal();
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });

    // immediately re-fetch from /api/state so UI gets startedAt/lastAccruedAt/etc
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    // If you don’t have this route yet, keep compile-safe.
    try {
      await fetchJson("/api/boost/activate", { method: "POST" });
    } catch {
      // ignore for now
    }
    return await this.getState();
  },

  // ---- methods your UI calls (compile-safe) ----

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", { method: "POST" });
    return String(data?.csv ?? "");
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    // If /api/profile exists, great. If not, don’t crash build.
    try {
      await fetchJson("/api/profile", { method: "PATCH", body: JSON.stringify(updates) });
    } catch {
      // ignore for now
    }
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    try {
      await fetchJson("/api/profile/verify-email", { method: "POST", body: JSON.stringify({ email }) });
    } catch {
      // ignore for now
    }
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    try {
      const method = action === "clear" ? "DELETE" : "PATCH";
      await fetchJson("/api/notifications", {
        method,
        body: JSON.stringify({ action, id }),
      });
    } catch {
      // ignore for now
    }
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    try {
      await fetchJson("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ prefs }),
      });
    } catch {
      // ignore for now
    }
    return await this.getState();
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return String(data?.sessionId ?? "");
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    try {
      await fetchJson("/api/store/webhook", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // ignore for now
    }
    return await this.getState();
  },
};