// lib/api.ts
import { AppState, NotificationPreferences, NotificationType } from "./types";

/**
 * Server /api/state response shape (your current route.ts)
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // Date serialized
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null;     // Date serialized
    lastAccruedAt: string | null; // Date serialized
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const SESSION_DURATION_SECONDS = 60 * 60 * 3; // 3h (must match your API)
const STORAGE_KEY = "echo_miner_state_v2"; // bump version to avoid old broken localStorage

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
 * Create a minimal-but-valid AppState for your existing UI.
 * We fill anything not coming from server with safe defaults.
 */
function makeDefaultAppState(): AppState {
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
      referralCode: "--------",
      notificationPreferences: defaultNotificationPrefs(),
      email: "",
      emailVerified: false,
      pfpUrl: undefined,
      isAdmin: false,
      priorityAirdrop: false,
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
 * Convert ApiState -> AppState (your UI shape)
 */
function apiToAppState(api: ApiState, prev: AppState | null): AppState {
  const base = prev ?? makeDefaultAppState();

  const totalMined = Number(api?.user?.totalMinedEcho ?? 0);

  const startedAtMs = api.session.startedAt ? Date.parse(api.session.startedAt) : null;
  const endTimeMs =
    startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const baseRatePerHr = Number(api.session.baseRatePerHr ?? 0);
  const mult = Number(api.session.multiplier ?? 1);

  // UI expects rates in "per second" (your old page.ts did elapsedSec * effectiveRate)
  const baseRatePerSec = baseRatePerHr / 3600;
  const effectiveRatePerSec = (baseRatePerHr * mult) / 3600;

  return {
    ...base,

    // --- user ---
    user: {
      ...base.user,
      // keep existing id/username/etc from prev, but update mined total from server truth
      totalMined,
      // optionally reflect into balance too if your UI uses it
      balance: base.user.balance ?? 0,
      notificationPreferences: base.user.notificationPreferences ?? defaultNotificationPrefs(),
    },

    // --- wallet ---
    walletAddress: api.wallet.address,
    walletVerifiedAt: api.wallet.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,

    // --- session ---
    session: {
      ...base.session,
      isActive: !!api.session.isActive,
      startTime: startedAtMs,
      endTime: endTimeMs,
      baseRate: baseRatePerSec,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: effectiveRatePerSec,
      status: api.session.isActive ? "active" : "ended",
    },
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }

  return res.json();
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

  /**
   * IMPORTANT: uses GET, and converts API shape -> AppState shape.
   */
  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // server uses cookie; body isn't needed anymore
    await fetchJson("/api/mining/refresh", { method: "POST" }).catch(() => null);
    return this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const body = {
      baseRatePerHr: payload?.baseRatePerHr ?? 120, // pick a default your UI expects
      multiplier: payload?.multiplier ?? 1,
    };

    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(body),
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