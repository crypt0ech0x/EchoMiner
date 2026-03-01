// lib/api.ts
import {
  AppState,
  ActiveBoost,
  AppNotification,
  LedgerEntry,
  NotificationPreferences,
  StreakInfo,
  WalletInfo,
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
    startedAt: string | null;
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const DEFAULT_PREFS: NotificationPreferences = {
  session_end: true,
  streak_grace_warning: true,
  boost_expired: true,
  weekly_summary: true,
  airdrop_announcement: true,
};

function safeNumber(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const wallet: WalletInfo = {
    address: api?.wallet?.address ?? null,
    verified: !!api?.wallet?.verified,
    verifiedAt: api?.wallet?.verifiedAt ?? null,
  };

  const totalMinedEcho = safeNumber(api?.user?.totalMinedEcho, 0);

  // session mapping (server → UI)
  const isActive = !!api?.session?.isActive;
  const startedAtMs = api.session.startedAt ? new Date(api.session.startedAt).getTime() : null;

  // your server uses 3 hours currently
  const SESSION_DURATION_MS = 3 * 60 * 60 * 1000;
  const endTimeMs = startedAtMs ? startedAtMs + SESSION_DURATION_MS : null;

  const baseRatePerHr = safeNumber(api?.session?.baseRatePerHr, 0);
  const multiplier = safeNumber(api?.session?.multiplier, 1);
  const baseRatePerSec = baseRatePerHr / 3600;
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;
  const sessionMined = safeNumber(api?.session?.sessionMined, 0);

  const prevUser = prev?.user;

  // IMPORTANT: MineTab shows `state.user.balance`
  // so we set balance = total mined (for now).
  // If later you add spend/store balance, split these properly.
  const user = {
    id: prevUser?.id ?? "user",
    username: prevUser?.username ?? "Voyager",
    balance: totalMinedEcho,
    totalMined: totalMinedEcho,
    referrals: prevUser?.referrals ?? 0,
    joinedDate: prevUser?.joinedDate ?? Date.now(),
    guest: prevUser?.guest ?? false,
    riskScore: prevUser?.riskScore ?? 0,
    referralCode: prevUser?.referralCode ?? "ECHO",
    isAdmin: prevUser?.isAdmin ?? false,
    priorityAirdrop: prevUser?.priorityAirdrop ?? false,
    pfpUrl: prevUser?.pfpUrl,
    email: prevUser?.email,
    emailVerified: prevUser?.emailVerified ?? false,
    notificationPreferences: prevUser?.notificationPreferences ?? DEFAULT_PREFS,
  };

  const streak: StreakInfo = prev?.streak ?? {
    currentStreak: 0,
    lastSessionStartAt: null,
    lastSessionEndAt: null,
    graceEndsAt: null,
  };

  const session = {
    id: prev?.session?.id ?? "session",
    isActive,
    startTime: startedAtMs,
    endTime: endTimeMs,
    baseRate: baseRatePerSec,
    streakMultiplier: 1,
    boostMultiplier: 1,
    purchaseMultiplier: 1,
    effectiveRate: effectiveRatePerSec,
    status: isActive ? "active" : "ended",
    sessionMined,
    startedAt: api.session.startedAt,
    lastAccruedAt: api.session.lastAccruedAt,
    baseRatePerHr,
    multiplier,
  };

  const walletVerifiedAtMs =
    wallet.verifiedAt ? new Date(wallet.verifiedAt).getTime() : null;

  return {
    authed: !!api.authed,
    wallet,

    user,
    streak,
    session,

    activeBoosts: (prev?.activeBoosts ?? []) as ActiveBoost[],
    ledger: (prev?.ledger ?? []) as LedgerEntry[],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: (prev?.notifications ?? []) as AppNotification[],

    // legacy mirror fields (avoid breaking older components)
    walletAddress: wallet.address,
    walletVerifiedAt: walletVerifiedAtMs,
    currentNonce: prev?.currentNonce ?? null,
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
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${url} failed (${res.status})${text ? `: ${text}` : ""}`);
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
    // refresh route updates DB accrual; then re-pull /api/state for UI
    await this.fetchJson("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await this.fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    // keep compatibility if route exists; if not, it will throw clearly
    await this.fetchJson("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

  // ---- keep these so ProfileDrawer/StoreTab compile ----

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