// lib/api.ts
import type {
  AppState,
  NotificationPreferences,
  NotificationType,
} from "./types";

type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet?: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null;
  };
  user?: {
    totalMinedEcho: number;
  };
  session?: {
    isActive: boolean;
    startedAt: string | null;
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

// Keep in sync with your server routes
const SESSION_DURATION_SECONDS = 60 * 60 * 3;

function nowMs() {
  return Date.now();
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function defaultNotificationPrefs(): NotificationPreferences {
  return {
    session_end: true,
    streak_grace_warning: true,
    boost_expired: true,
    weekly_summary: true,
    airdrop_announcement: true,
  };
}

/**
 * Convert API -> existing AppState (so MineTab keeps working without changes)
 */
function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const wallet = api.wallet ?? {
    address: null,
    verified: false,
    verifiedAt: null,
  };

  const totalMinedEcho = api.user?.totalMinedEcho ?? 0;

  const startedAtMs = api.session?.startedAt ? Date.parse(api.session.startedAt) : null;
  const endTimeMs = startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const baseRatePerHr = api.session?.baseRatePerHr ?? 0;
  const multiplier = api.session?.multiplier ?? 1;

  // UI expects rates in ECHO/sec
  const baseRatePerSec = baseRatePerHr / 3600;
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;

  const merged: AppState = {
    // --- user ---
    user: {
      // preserve anything your UI expects from old state
      ...(prev?.user ?? ({} as any)),
      id: prev?.user?.id ?? "guest",
      username: prev?.user?.username ?? "Voyager",
      pfpUrl: prev?.user?.pfpUrl,
      guest: prev?.user?.guest ?? true,
      // these are what MineTab uses
      balance: totalMinedEcho,
      totalMined: totalMinedEcho,
      // keep required fields from your type
      referrals: prev?.user?.referrals ?? 0,
      joinedDate: prev?.user?.joinedDate ?? nowMs(),
      riskScore: prev?.user?.riskScore ?? 0,
      referralCode: prev?.user?.referralCode ?? "N/A",
      isAdmin: prev?.user?.isAdmin ?? false,
      priorityAirdrop: prev?.user?.priorityAirdrop ?? false,
      email: prev?.user?.email,
      emailVerified: prev?.user?.emailVerified ?? false,
      notificationPreferences:
        prev?.user?.notificationPreferences ?? defaultNotificationPrefs(),
    },

    // --- streak (keep existing unless you’ve moved it server-side) ---
    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    // --- session (THIS is what MineTab depends on) ---
    session: {
      ...(prev?.session ?? ({} as any)),
      id: prev?.session?.id ?? "session",
      isActive: api.session?.isActive ?? false,
      startTime: startedAtMs,
      endTime: endTimeMs,
      baseRate: baseRatePerSec,
      streakMultiplier: prev?.session?.streakMultiplier ?? 1,
      boostMultiplier: prev?.session?.boostMultiplier ?? 1,
      purchaseMultiplier: prev?.session?.purchaseMultiplier ?? 1,
      effectiveRate: effectiveRatePerSec,
      status: api.session?.isActive ? "active" : "ended",
    },

    // --- boosts/ledger/history/notifications (keep local for now) ---
    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],

    // --- wallet fields your UI currently uses ---
    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt ? Date.parse(wallet.verifiedAt) : null,
    currentNonce: prev?.currentNonce ?? null,
  };

  return merged;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // If backend returned HTML error page, etc.
    throw new Error(`Bad JSON from ${url}: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/**
 * Client-side API bridge for ECHO Miner.
 */
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

  async getState(): Promise<AppState> {
    const prev = this.loadLocal() ?? undefined;
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // server accrues on refresh; then we re-fetch state
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr = payload?.baseRatePerHr ?? 120; // pick a sane default if you want
    const multiplier = payload?.multiplier ?? 1;

    await fetchJson("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRatePerHr, multiplier }),
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, all: action === "readAll" }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", { method: "POST" });
    return data.csv as string;
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    return data.sessionId as string;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};