// lib/api.ts
import {
  AppState,
  WalletState,
  NotificationPreferences,
  NotificationType,
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

const STORAGE_KEY = "echo_miner_state_v1";

function loadLocal(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

function saveLocal(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} failed (${res.status}) ${text}`);
  }
  return res.json();
}

// Build a safe fallback state (so UI never crashes)
function defaultAppState(prev?: AppState | null): AppState {
  const now = Date.now();

  return {
    authed: false,
    wallet: { address: null, verified: false, verifiedAt: null },

    user: {
      id: prev?.user?.id ?? "guest",
      username: prev?.user?.username ?? "Voyager",
      balance: prev?.user?.balance ?? 0,
      totalMined: prev?.user?.totalMined ?? 0,
      referrals: prev?.user?.referrals ?? 0,
      joinedDate: prev?.user?.joinedDate ?? now,
      guest: prev?.user?.guest ?? true,
      riskScore: prev?.user?.riskScore ?? 0,
      referralCode: prev?.user?.referralCode ?? "N/A",
      isAdmin: prev?.user?.isAdmin ?? false,
      priorityAirdrop: prev?.user?.priorityAirdrop ?? false,
      pfpUrl: prev?.user?.pfpUrl,
      email: prev?.user?.email,
      emailVerified: prev?.user?.emailVerified ?? false,
      notificationPreferences:
        prev?.user?.notificationPreferences ?? {
          session_end: true,
          streak_grace_warning: true,
          boost_expired: true,
          weekly_summary: true,
          airdrop_announcement: true,
        },
    },

    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    session: prev?.session ?? {
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

    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],

    walletAddress: prev?.walletAddress ?? null,
    walletVerifiedAt: prev?.walletVerifiedAt ?? null,
    currentNonce: prev?.currentNonce ?? null,
  };
}

function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const base = defaultAppState(prev);

  const wallet: WalletState = {
    address: api.wallet?.address ?? null,
    verified: !!api.wallet?.verified,
    verifiedAt: api.wallet?.verifiedAt ?? null,
  };

  const total = Number(api.user?.totalMinedEcho ?? 0);

  const baseRatePerHr = Number(api.session?.baseRatePerHr ?? 0);
  const multiplier = Number(api.session?.multiplier ?? 1);
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;

  return {
    ...base,

    authed: !!api.authed,
    wallet,

    // keep UI happy
    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt ? new Date(wallet.verifiedAt).getTime() : null,

    // reflect DB truth
    user: {
      ...base.user,
      totalMined: total,
      // optional: keep balance tied to total mined if your UI expects it
      balance: total,
      guest: !api.authed,
    },

    // update “session” in a way MineTab can display
    session: {
      ...base.session,
      isActive: !!api.session?.isActive,

      // legacy values MineTab uses
      baseRate: baseRatePerHr, // per-hour in this migration
      effectiveRate: effectiveRatePerSec, // per-second (MineTab does *3600 to show /hr)
      status: api.session?.isActive ? "active" : "ended",

      // new DB fields
      startedAt: api.session?.startedAt ?? null,
      lastAccruedAt: api.session?.lastAccruedAt ?? null,
      baseRatePerHr,
      multiplier,
      sessionMined: Number(api.session?.sessionMined ?? 0),
    },
  };
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal,
  saveLocal,

  async getState(): Promise<AppState> {
    const prev = loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // server accrues mining + writes to DB
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
    // if you have a real endpoint, keep it; otherwise harmless no-op
    try {
      await fetchJson("/api/boost/activate", { method: "POST" });
    } catch {
      // ignore if not implemented yet
    }
    return this.getState();
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    // if you have a real endpoint, keep it; otherwise just return state
    try {
      await fetchJson("/api/profile", { method: "PATCH", body: JSON.stringify(updates) });
    } catch {
      // ignore if not implemented yet
    }
    return this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    try {
      await fetchJson("/api/profile/verify-email", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // ignore if not implemented yet
    }
    return this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    try {
      await fetchJson("/api/notifications", {
        method: action === "clear" ? "DELETE" : "PATCH",
        body: JSON.stringify({ action, id }),
      });
    } catch {
      // ignore if not implemented yet
    }
    return this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    try {
      await fetchJson("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ prefs }),
      });
    } catch {
      // ignore if not implemented yet
    }
    return this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    // optional real endpoint
    const res = await fetch("/api/snapshot", { method: "POST" });
    if (!res.ok) throw new Error("snapshot failed");
    const data = (await res.json()) as { csv?: string };
    return data.csv ?? "";
  },

  async createStripeSession(itemId: string): Promise<string> {
    // optional real endpoint
    const res = await fetch("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    if (!res.ok) throw new Error("stripe checkout failed");
    const data = (await res.json()) as { sessionId?: string };
    if (!data.sessionId) throw new Error("missing sessionId");
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    // optional real endpoint
    try {
      await fetchJson("/api/store/webhook", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // ignore if not implemented yet
    }
    return this.getState();
  },
};