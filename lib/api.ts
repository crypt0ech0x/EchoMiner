// lib/api.ts
import type {
  AppState,
  NotificationPreferences,
  NotificationType,
  MiningSession,
  UserStats,
  StreakInfo,
  ActiveBoost,
  LedgerEntry,
  AppNotification,
} from "./types";

/**
 * This matches what your /api/state route returns.
 * (Keep this in sync with app/api/state/route.ts)
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
    startedAt: string | null; // ISO
    lastAccruedAt: string | null; // ISO
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
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
 * Convert server ApiState -> UI AppState (your existing legacy shape).
 * We keep lots of legacy fields with safe defaults so the UI won’t crash.
 */
function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const now = Date.now();

  const prevUser = prev?.user;
  const prevStreak = prev?.streak;
  const prevSession = prev?.session;

  const totalMined = api?.user?.totalMinedEcho ?? prevUser?.totalMined ?? 0;

  const user: UserStats = {
    id: prevUser?.id ?? "guest",
    username: prevUser?.username ?? "Voyager",
    balance: prevUser?.balance ?? 0,
    totalMined,
    referrals: prevUser?.referrals ?? 0,
    joinedDate: prevUser?.joinedDate ?? now,
    guest: !api.authed, // if not authed, treat as guest
    riskScore: prevUser?.riskScore ?? 0,
    referralCode: prevUser?.referralCode ?? "ECHO-0000",
    isAdmin: prevUser?.isAdmin ?? false,
    priorityAirdrop: prevUser?.priorityAirdrop ?? false,
    pfpUrl: prevUser?.pfpUrl,
    email: prevUser?.email,
    emailVerified: prevUser?.emailVerified ?? false,
    notificationPreferences: prevUser?.notificationPreferences ?? defaultNotificationPrefs(),
  };

  const streak: StreakInfo = {
    currentStreak: prevStreak?.currentStreak ?? 0,
    lastSessionStartAt: prevStreak?.lastSessionStartAt ?? null,
    lastSessionEndAt: prevStreak?.lastSessionEndAt ?? null,
    graceEndsAt: prevStreak?.graceEndsAt ?? null,
  };

  // Your legacy MiningSession expects startTime/endTime/etc.
  // We map server startedAt -> startTime, and we keep effectiveRate as per-hour.
  const effectiveRatePerHr = (api.session.baseRatePerHr ?? 0) * (api.session.multiplier ?? 1);

  const session: MiningSession = {
    id: prevSession?.id ?? "session",
    isActive: !!api.session.isActive,
    startTime: isoToMs(api.session.startedAt),
    endTime: null, // optional in UI; you can set from server later if you want
    baseRate: api.session.baseRatePerHr ?? 0,
    streakMultiplier: 1,
    boostMultiplier: 1,
    purchaseMultiplier: 1,
    effectiveRate: effectiveRatePerHr / 3600, // NOTE: your UI uses effectiveRate as "per second" in some places
    status: api.session.isActive ? "active" : "ended",
  };

  const activeBoosts: ActiveBoost[] = prev?.activeBoosts ?? [];
  const ledger: LedgerEntry[] = prev?.ledger ?? [];
  const purchaseHistory: any[] = prev?.purchaseHistory ?? [];
  const notifications: AppNotification[] = prev?.notifications ?? [];

  return {
    user,
    streak,
    session,
    activeBoosts,
    ledger,
    purchaseHistory,
    notifications,
    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: isoToMs(api.wallet?.verifiedAt),
    currentNonce: null,
  };
}

export const EchoAPI = {
  // bump this if you want to force-clear old incompatible local state
  STORAGE_KEY: "echo_miner_state_v2",

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

  // IMPORTANT: method syntax supports generics in TS
  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // cookies included by default for same-origin; keep explicit for safety
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${url} failed (${res.status}) ${text}`);
    }

    return (await res.json()) as T;
  },

  /**
   * Fetch server state and convert to AppState for UI.
   */
  async getState(): Promise<AppState> {
    const prev = this.loadLocal() ?? undefined;
    const api = await this.fetchJson<ApiState>("/api/state", { method: "GET" });
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  /**
   * Refresh mining accrual (server uses session cookie; no client state sent)
   */
  async refreshState(): Promise<AppState> {
    // call refresh; ignore body
    await this.fetchJson<{ ok: boolean } | any>("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  /**
   * Start mining session in DB
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr = payload?.baseRatePerHr ?? 1;
    const multiplier = payload?.multiplier ?? 1;

    await this.fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await this.fetchJson("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    await this.fetchJson("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await this.fetchJson("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await this.fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ action, id }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await this.fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = await this.fetchJson<{ csv: string }>("/api/snapshot", { method: "POST" });
    return data.csv;
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await this.fetchJson<{ sessionId: string }>("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await this.fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};