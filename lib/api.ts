// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * This matches what your server /api/state returns (the minimal DB-backed shape).
 * We'll convert this -> your existing AppState so your UI doesn't break.
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
    startedAt: string | null; // Date serialized
    lastAccruedAt: string | null; // Date serialized
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";

// Your server uses 3 hours right now
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    // cookies for session auth
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    // try to read JSON error, else text
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status}) ${text}`.trim());
  }

  return (await res.json()) as T;
}

function defaultPrefs(): NotificationPreferences {
  return {
    session_end: true,
    streak_grace_warning: true,
    boost_expired: true,
    weekly_summary: true,
    airdrop_announcement: true,
  };
}

/**
 * Convert ApiState (server) into your legacy AppState (client UI).
 * If we have a previous local AppState, we preserve as much as possible.
 */
function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const prevState = prev ?? ({} as AppState);

  const totalMined = Number(api?.user?.totalMinedEcho ?? 0);

  const startedAtMs = api.session.startedAt ? new Date(api.session.startedAt).getTime() : null;
  const endTimeMs =
    startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const baseRatePerHr = Number(api.session.baseRatePerHr ?? 0);
  const multiplier = Number(api.session.multiplier ?? 1);

  // MineTab uses effectiveRate as E/s
  const effectiveRate = (baseRatePerHr * multiplier) / 3600;

  const walletVerifiedAtMs = api.wallet.verifiedAt ? new Date(api.wallet.verifiedAt).getTime() : null;

  return {
    // --- user ---
    user: {
      // keep existing user fields if present
      ...(prevState.user ?? ({} as any)),
      id: prevState.user?.id ?? "local",
      username: prevState.user?.username ?? "Voyager",
      balance: totalMined,       // UI shows this as "balance"
      totalMined: totalMined,    // types.ts expects totalMined
      referrals: prevState.user?.referrals ?? 0,
      joinedDate: prevState.user?.joinedDate ?? nowMs(),
      guest: prevState.user?.guest ?? false,
      riskScore: prevState.user?.riskScore ?? 0,
      referralCode: prevState.user?.referralCode ?? "VOYAGER",
      isAdmin: prevState.user?.isAdmin ?? false,
      priorityAirdrop: prevState.user?.priorityAirdrop ?? false,
      pfpUrl: prevState.user?.pfpUrl,
      email: prevState.user?.email,
      emailVerified: prevState.user?.emailVerified ?? false,
      notificationPreferences:
        prevState.user?.notificationPreferences ?? defaultPrefs(),
    },

    // --- streak (keep existing / default) ---
    streak: prevState.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    // --- session (legacy client shape) ---
    session: {
      id: prevState.session?.id ?? "session",
      isActive: !!api.session.isActive,
      startTime: startedAtMs,
      endTime: endTimeMs,
      baseRate: baseRatePerHr / 3600, // E/s base
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate, // E/s
      status: api.session.isActive ? "active" : "ended",
    },

    // --- boosts / ledger / notifications etc (keep existing safe defaults) ---
    activeBoosts: prevState.activeBoosts ?? [],
    ledger: prevState.ledger ?? [],
    purchaseHistory: prevState.purchaseHistory ?? [],
    notifications: prevState.notifications ?? [],

    // --- wallet fields used by WalletTab & old UI ---
    walletAddress: api.wallet.address,
    walletVerifiedAt: walletVerifiedAtMs,
    currentNonce: prevState.currentNonce ?? null,
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
    const api = await fetchJson<ApiState>("/api/state", { method: "GET" });
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // refresh accrual server-side, then re-read /api/state
    await fetchJson<{ ok: boolean } | any>("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr = payload?.baseRatePerHr ?? 1; // sensible default
    const multiplier = payload?.multiplier ?? 1;

    await fetchJson<{ ok: boolean } | any>("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await fetchJson<{ ok: boolean } | any>("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    await fetchJson<any>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson<any>("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson<any>("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson<any>("/api/notifications", {
      method,
      body: JSON.stringify({ action, id }),
    });
    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson<{ csv: string }>("/api/snapshot", { method: "POST" });
    return data.csv ?? "";
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson<{ sessionId: string }>("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson<any>("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};