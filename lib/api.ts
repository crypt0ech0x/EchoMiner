// lib/api.ts
import { AppState, NotificationPreferences, NotificationType } from "./types";

/**
 * Server /api/state response shape (your route.ts returns this).
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // ISO or null
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null; // ISO or null
    lastAccruedAt: string | null; // ISO or null
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";
const SESSION_DURATION_SECONDS = 60 * 60 * 3; // must match your server

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
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

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    // helpful message for debugging
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }

  return res.json();
}

function defaultAppState(): AppState {
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
      id: "server-session",
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
 * Convert /api/state -> your existing AppState shape (lib/types.ts).
 * We preserve "local-only" fields from prev state (notifications, ledger, etc.)
 * so the UI doesn't explode.
 */
function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const base = prev ?? defaultAppState();

  const totalMined = Number(api?.user?.totalMinedEcho ?? 0);

  const startedAtMs = api.session?.startedAt ? Date.parse(api.session.startedAt) : null;
  const endAtMs =
    startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const baseRatePerHr = Number(api.session?.baseRatePerHr ?? 0);
  const multiplier = Number(api.session?.multiplier ?? 1);

  // Your UI treats effectiveRate like "per second" in a few places,
  // so convert per-hour -> per-second.
  const baseRatePerSec = baseRatePerHr / 3600;
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;

  return {
    ...base,

    user: {
      ...base.user,
      // keep existing identity fields, only override mined stats:
      totalMined,
      balance: base.user.balance ?? 0,
    },

    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: api.wallet?.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,

    // Session: keep your UI shape but reflect server truth
    session: {
      ...base.session,
      id: base.session?.id ?? "server-session",
      isActive: !!api.session?.isActive,
      startTime: startedAtMs,
      endTime: endAtMs,
      baseRate: Number.isFinite(baseRatePerSec) ? baseRatePerSec : 0,
      streakMultiplier: base.session?.streakMultiplier ?? 1,
      boostMultiplier: base.session?.boostMultiplier ?? 1,
      purchaseMultiplier: base.session?.purchaseMultiplier ?? 1,
      effectiveRate: Number.isFinite(effectiveRatePerSec) ? effectiveRatePerSec : 0,
      status: api.session?.isActive ? "active" : "ended",
    },

    // Keep these as-is unless your server later returns them:
    activeBoosts: base.activeBoosts ?? [],
    ledger: base.ledger ?? [],
    purchaseHistory: base.purchaseHistory ?? [],
    notifications: base.notifications ?? [],
    streak: base.streak ?? base.streak,
    currentNonce: base.currentNonce ?? null,
  };
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal,
  saveLocal,

  async getState(): Promise<AppState> {
    const prev = loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;

    // If server returns something unexpected, don’t crash the app:
    if (!api || typeof api !== "object" || typeof api.ok !== "boolean") {
      return prev ?? defaultAppState();
    }

    const app = apiToAppState(api, prev);
    saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // Server refresh is authoritative for mining accrual now.
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 120, // pick your default
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
      body: JSON.stringify({ prefs }),
    });
    return this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = (await fetchJson("/api/snapshot", { method: "POST" })) as { csv: string };
    return data.csv ?? "";
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = (await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    })) as { sessionId: string };

    if (!data?.sessionId) throw new Error("Missing sessionId from checkout");
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return this.getState();
  },
};