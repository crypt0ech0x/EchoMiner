// lib/api.ts
import {
  AppState,
  NotificationPreferences,
  WalletState,
  SessionStatus,
} from "./types";

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
    startedAt: string | null; // Date ISO or null
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";

// IMPORTANT: this MUST match your server routes (you currently use 3 hours)
const SESSION_DURATION_SECONDS = 60 * 60 * 3;

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

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

function defaultState(): AppState {
  const wallet: WalletState = { address: null, verified: false, verifiedAt: null };

  return {
    authed: false,
    wallet,

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
      sessionMined: 0,
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

function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const base = prev ?? defaultState();

  const wallet: WalletState = {
    address: api.wallet?.address ?? null,
    verified: !!api.wallet?.verified,
    verifiedAt: api.wallet?.verifiedAt ?? null,
  };

  const startedAtMs = api.session.startedAt ? Date.parse(api.session.startedAt) : null;
  const endTimeMs =
    startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const isActive = !!api.session.isActive;

  const baseRatePerHr = Number(api.session.baseRatePerHr ?? 0);
  const multiplier = Number(api.session.multiplier ?? 1);

  // UI expects per-second rates
  const baseRatePerSec = baseRatePerHr / 3600;
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;

  const sessionMined = Number(api.session.sessionMined ?? 0);

  // ✅ IMPORTANT: user.totalMinedEcho includes session increments (your refresh increments user.totalMinedEcho)
  // MineTab computes: currentTotal = user.balance + (isActive ? sessionEarnings : 0)
  // So set balance = totalMinedEcho - sessionMined while active to avoid double counting
  const totalMinedEcho = Number(api.user?.totalMinedEcho ?? 0);
  const safeBalance = isActive ? Math.max(0, totalMinedEcho - sessionMined) : totalMinedEcho;

  const status: SessionStatus = isActive ? "active" : "ended";

  return {
    ...base,

    authed: !!api.authed,
    wallet,

    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt ? Date.parse(wallet.verifiedAt) : null,

    user: {
      ...base.user,
      // preserve your existing UI fields but keep totals synced
      balance: safeBalance,
      totalMined: totalMinedEcho,
    },

    session: {
      ...base.session,
      id: base.session.id || "session",
      isActive,
      startTime: startedAtMs,
      endTime: endTimeMs,

      baseRate: baseRatePerSec,
      effectiveRate: effectiveRatePerSec,
      status,

      // expose server truth
      sessionMined,
      baseRatePerHr,
      multiplier,
    },
  };
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
    const prev = this.loadLocal() ?? undefined;
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // Your refresh route is server-driven; no need to POST state
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
    return this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await fetchJson("/api/boost/activate", { method: "POST" });
    return this.getState();
  },

  // ---- keep these so your other components compile ----
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

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", { method: "POST" });
    return (data?.csv as string) ?? "";
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ action, id }),
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

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return data?.sessionId as string;
  },
};