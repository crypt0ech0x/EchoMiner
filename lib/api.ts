// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * Server /api/state response shape (your current route.ts)
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // ISO
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null; // ISO
    lastAccruedAt: string | null; // ISO
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

type Json = Record<string, any>;

const STORAGE_KEY = "echo_miner_state_v1";

// ---------- helpers (no `this`, fully typed) ----------
function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
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

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    // keep cookies for session auth
    credentials: "include",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });

  // Next can return HTML on edge failures; guard it
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not json
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Map server ApiState -> your UI AppState.
 * We keep everything the UI expects, filling defaults and preserving prior local state.
 */
function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const p = prev ?? ({} as AppState);

  const walletAddress = api.wallet?.address ?? null;
  const walletVerifiedAt = api.wallet?.verifiedAt
    ? Date.parse(api.wallet.verifiedAt)
    : null;

  // --- session mapping ---
  const startedAtMs = isoToMs(api.session?.startedAt ?? null);
  const endTimeMs =
    startedAtMs != null ? startedAtMs + 3 * 60 * 60 * 1000 : null; // 3h session window

  const baseRate = Number(api.session?.baseRatePerHr ?? 0);
  const mult = Number(api.session?.multiplier ?? 1);
  const effectiveRatePerHr = baseRate * mult;

  // Your UI expects MiningSession.effectiveRate to be "per second" (based on earlier code)
  // so we store effectiveRate as "per second" to keep UI math stable.
  const effectiveRatePerSec = effectiveRatePerHr / 3600;

  // Some UIs use balance, totalMined, etc. We keep existing if present.
  const userId = p.user?.id ?? "guest";
  const username = p.user?.username ?? "Voyager";

  const state: AppState = {
    // --- user ---
    user: {
      ...(p.user ?? ({} as any)),
      id: userId,
      username,
      balance: p.user?.balance ?? 0,
      totalMined: Number(api.user?.totalMinedEcho ?? 0),
      referrals: p.user?.referrals ?? 0,
      joinedDate: p.user?.joinedDate ?? Date.now(),
      guest: p.user?.guest ?? !api.authed,
      riskScore: p.user?.riskScore ?? 0,
      referralCode: p.user?.referralCode ?? "ECHO-0000",
      isAdmin: p.user?.isAdmin ?? false,
      priorityAirdrop: p.user?.priorityAirdrop ?? false,
      pfpUrl: p.user?.pfpUrl,
      email: p.user?.email,
      emailVerified: p.user?.emailVerified ?? false,
      notificationPreferences: p.user?.notificationPreferences ?? {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
    },

    // --- streak (keep existing; server not providing yet) ---
    streak: p.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    // --- session ---
    session: {
      ...(p.session ?? ({} as any)),
      id: p.session?.id ?? "active",
      isActive: !!api.session?.isActive,
      startTime: startedAtMs,
      endTime: endTimeMs,
      baseRate: baseRate,
      streakMultiplier: p.session?.streakMultiplier ?? 1,
      boostMultiplier: p.session?.boostMultiplier ?? 1,
      purchaseMultiplier: p.session?.purchaseMultiplier ?? 1,
      effectiveRate: effectiveRatePerSec, // used by MineTab UI math
      status: api.session?.isActive ? "active" : "ended",
    },

    // --- boosts/ledger/history/notifications keep local until you DB them ---
    activeBoosts: p.activeBoosts ?? [],
    ledger: p.ledger ?? [],
    purchaseHistory: p.purchaseHistory ?? [],
    notifications: p.notifications ?? [],

    // --- wallet fields used by your UI ---
    walletAddress,
    walletVerifiedAt,
    currentNonce: p.currentNonce ?? null,
  };

  return state;
}

// ---------- public API ----------
export const EchoAPI = {
  STORAGE_KEY,

  loadLocal,
  saveLocal,

  /**
   * GET /api/state returns ApiState.
   * We normalize it into AppState for the UI.
   */
  async getState(): Promise<AppState> {
    const prev = loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;

    // Hard safety: ensure wallet object exists
    if (!api || typeof api !== "object") {
      throw new Error("Bad /api/state response");
    }
    if (!api.wallet) {
      (api as any).wallet = { address: null, verified: false, verifiedAt: null };
    }
    if (!api.session) {
      (api as any).session = {
        isActive: false,
        startedAt: null,
        lastAccruedAt: null,
        baseRatePerHr: 0,
        multiplier: 1,
        sessionMined: 0,
      };
    }
    if (!api.user) {
      (api as any).user = { totalMinedEcho: 0 };
    }

    const app = apiToAppState(api, prev);
    saveLocal(app);
    return app;
  },

  /**
   * POST /api/mining/refresh
   * Server reads session cookie + DB, no need to send state.
   */
  async refreshState(): Promise<AppState> {
    await fetchJson("/api/mining/refresh", { method: "POST", body: "{}" });
    // refresh endpoint returns mining info, but easiest is: re-pull canonical state
    return this.getState();
  },

  /**
   * POST /api/mining/start
   * IMPORTANT: your server requires baseRatePerHr > 0.
   * If UI calls startSession() with no args, we provide sane defaults so mining isn't 0.
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr =
      Number(payload?.baseRatePerHr ?? 10); // default so it actually mines
    const multiplier = Number(payload?.multiplier ?? 1);

    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    return this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await fetchJson("/api/boost/activate", { method: "POST", body: "{}" });
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

  async getSnapshotCSV(): Promise<string> {
    const data = (await fetchJson("/api/snapshot", { method: "POST", body: "{}" })) as Json;
    return String(data?.csv ?? "");
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = (await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    })) as Json;

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