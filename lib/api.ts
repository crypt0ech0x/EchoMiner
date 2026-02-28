// lib/api.ts
import { AppState, NotificationPreferences } from "./types";

// What /api/state returns now
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
    startedAt: string | null;     // ISO
    lastAccruedAt: string | null; // ISO
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Convert your new server ApiState into the AppState
 * your existing UI expects (lib/types.ts).
 */
function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const now = Date.now();

  const safePrev: AppState | undefined = prev;

  return {
    // --- user ---
    user: {
      ...(safePrev?.user ?? ({} as any)),
      totalMined: api.user?.totalMinedEcho ?? 0,
      // keep required fields from previous local state if you still use them
      // NOTE: if you want server-truth for these later, move them into /api/state too
      id: safePrev?.user?.id ?? "guest",
      username: safePrev?.user?.username ?? "Voyager",
      balance: safePrev?.user?.balance ?? 0,
      referrals: safePrev?.user?.referrals ?? 0,
      joinedDate: safePrev?.user?.joinedDate ?? now,
      guest: safePrev?.user?.guest ?? true,
      riskScore: safePrev?.user?.riskScore ?? 0,
      referralCode: safePrev?.user?.referralCode ?? "ECHO",
      notificationPreferences:
        safePrev?.user?.notificationPreferences ?? {
          session_end: true,
          streak_grace_warning: true,
          boost_expired: true,
          weekly_summary: true,
          airdrop_announcement: true,
        },
      isAdmin: safePrev?.user?.isAdmin ?? false,
      priorityAirdrop: safePrev?.user?.priorityAirdrop ?? false,
      pfpUrl: safePrev?.user?.pfpUrl,
      email: safePrev?.user?.email,
      emailVerified: safePrev?.user?.emailVerified ?? false,
    },

    // --- streak (still local for now) ---
    streak:
      safePrev?.streak ?? {
        currentStreak: 0,
        lastSessionStartAt: null,
        lastSessionEndAt: null,
        graceEndsAt: null,
      },

    // --- session ---
    session: {
      ...(safePrev?.session ?? ({} as any)),
      id: safePrev?.session?.id ?? "session",
      isActive: api.session?.isActive ?? false,

      // your UI uses startTime/endTime numbers, but DB uses startedAt ISO.
      startTime: toMs(api.session?.startedAt),
      endTime: null,

      // Map your old session fields
      baseRate: api.session?.baseRatePerHr ?? 0,

      // Keep these if your UI expects them; otherwise you can simplify later
      streakMultiplier: safePrev?.session?.streakMultiplier ?? 1,
      boostMultiplier: safePrev?.session?.boostMultiplier ?? 1,
      purchaseMultiplier: safePrev?.session?.purchaseMultiplier ?? 1,

      // effectiveRate in your UI looks like "per second" sometimes; pick ONE convention.
      // Here: keep effectiveRate as "per second" to match your old earnings calc.
      effectiveRate: ((api.session?.baseRatePerHr ?? 0) * (api.session?.multiplier ?? 1)) / 3600,

      status: (api.session?.isActive ? "active" : "ended") as "active" | "ended" | "settled",
    },

    // --- boosts/ledger/purchases/notifications still local for now ---
    activeBoosts: safePrev?.activeBoosts ?? [],
    ledger: safePrev?.ledger ?? [],
    purchaseHistory: safePrev?.purchaseHistory ?? [],
    notifications: safePrev?.notifications ?? [],

    // --- wallet fields your UI expects ---
    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: toMs(api.wallet?.verifiedAt),

    // if your old flow uses nonce in UI, keep it
    currentNonce: safePrev?.currentNonce ?? null,
  };
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

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

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${url} failed (${res.status}) ${text}`.trim());
    }

    return (await res.json()) as T;
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal() ?? undefined;
    const api = await this.fetchJson<ApiState>("/api/state", { method: "GET" });
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // your /api/mining/refresh uses session cookie; no need to POST the whole state
    const prev = this.loadLocal() ?? undefined;

    // First: get latest server state (wallet/session totals)
    const api = await this.fetchJson<ApiState>("/api/state", { method: "GET" });

    // Then: refresh mining accrual
    await this.fetchJson<any>("/api/mining/refresh", { method: "POST" });

    // Finally: re-fetch state after refresh so UI gets updated numbers
    const api2 = await this.fetchJson<ApiState>("/api/state", { method: "GET" });

    const app = apiToAppState(api2, prev);
    this.saveLocal(app);
    return app;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr = payload?.baseRatePerHr ?? 60; // pick your default
    const multiplier = payload?.multiplier ?? 1;

    await this.fetchJson<any>("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({ baseRatePerHr, multiplier }),
    });

    // Pull fresh state after starting
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    await this.fetchJson<any>("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    await this.fetchJson<any>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await this.fetchJson<any>("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await this.fetchJson<any>("/api/notifications", {
      method,
      body: JSON.stringify({ id, all: action === "readAll" }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await this.fetchJson<any>("/api/notifications/preferences", {
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
    await this.fetchJson<any>("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};