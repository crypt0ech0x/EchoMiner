// lib/api.ts
import { AppState, WalletState } from "./types";

/**
 * This app used to store everything client-side.
 * Now the server is truth. We still keep a local cache to avoid UI flicker.
 */
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

function nowMs() {
  return Date.now();
}

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Build a "full" AppState that keeps your older UI happy,
 * while using the server response as truth.
 */
function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const prefs =
    prev?.user?.notificationPreferences ?? {
      session_end: true,
      streak_grace_warning: true,
      boost_expired: true,
      weekly_summary: true,
      airdrop_announcement: true,
    };

  const userId = prev?.user?.id ?? "local_user";
  const username = prev?.user?.username ?? "Voyager";
  const referralCode = prev?.user?.referralCode ?? "ECHO";

  const wallet: WalletState = {
    address: api.wallet?.address ?? null,
    verified: !!api.wallet?.verified,
    verifiedAt: api.wallet?.verifiedAt ?? null,
  };

  // DB fields
  const startedAtMs = api.session.startedAt ? new Date(api.session.startedAt).getTime() : null;
  const durationMs = 3 * 60 * 60 * 1000; // 3 hours (matches your route)
  const endTimeMs = startedAtMs ? startedAtMs + durationMs : null;

  const baseRatePerSec = (api.session.baseRatePerHr ?? 0) / 3600;
  const multiplier = api.session.multiplier ?? 1;
  const effectiveRatePerSec = baseRatePerSec * multiplier;

  const sessionStatus: "active" | "ended" | "settled" = api.session.isActive ? "active" : "ended";

  // IMPORTANT:
  // - user.balance is used in MineTab for the big number
  // - you can choose whether balance is "total mined" or something else
  // Here we set balance to total mined (server truth).
  const totalMined = api.user?.totalMinedEcho ?? 0;

  const merged: AppState = {
    ok: api.ok,
    authed: api.authed,
    wallet,

    user: {
      id: userId,
      username,
      balance: totalMined,
      totalMined: totalMined,
      referrals: prev?.user?.referrals ?? 0,
      joinedDate: prev?.user?.joinedDate ?? nowMs(),
      guest: prev?.user?.guest ?? !api.authed,
      riskScore: prev?.user?.riskScore ?? 0,
      referralCode,
      isAdmin: prev?.user?.isAdmin ?? false,
      priorityAirdrop: prev?.user?.priorityAirdrop ?? false,
      pfpUrl: prev?.user?.pfpUrl,
      email: prev?.user?.email,
      emailVerified: prev?.user?.emailVerified ?? false,
      notificationPreferences: prefs,
    },

    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    session: {
      id: prev?.session?.id ?? "session",
      isActive: !!api.session.isActive,
      startTime: startedAtMs,
      endTime: endTimeMs,
      baseRate: baseRatePerSec,
      streakMultiplier: prev?.session?.streakMultiplier ?? 1,
      boostMultiplier: prev?.session?.boostMultiplier ?? 1,
      purchaseMultiplier: prev?.session?.purchaseMultiplier ?? 1,
      effectiveRate: effectiveRatePerSec,
      status: sessionStatus,

      // server truth for display
      sessionMined: api.session.sessionMined ?? 0,
      startedAt: api.session.startedAt,
      lastAccruedAt: api.session.lastAccruedAt,
      baseRatePerHr: api.session.baseRatePerHr,
      multiplier: api.session.multiplier,
    },

    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],

    // legacy fields
    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt ? new Date(wallet.verifiedAt).getTime() : null,
    currentNonce: prev?.currentNonce ?? null,
  };

  return merged;
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    return safeJsonParse<AppState>(localStorage.getItem(this.STORAGE_KEY));
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  },

  async fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      // try to extract error message
      const text = await res.text().catch(() => "");
      throw new Error(`getState failed (${res.status}) ${text ? `- ${text}` : ""}`.trim());
    }

    return res.json();
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal();

    // /api/state supports GET (you added it)
    const api = (await this.fetchJson("/api/state", { method: "GET" })) as ApiState;

    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    const prev = this.loadLocal();

    // Server accrues mining on refresh
    const api = (await this.fetchJson("/api/mining/refresh", { method: "POST" })) as ApiState;

    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const prev = this.loadLocal();

    await this.fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });

    // After start, immediately re-fetch state so UI gets startedAt, etc.
    const api = (await this.fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  // keep these as no-ops for now so your UI compiles
  // (until you re-enable these routes server-side)
  async activateAdBoost(): Promise<AppState> {
    return this.getState();
  },
  async updateProfile(): Promise<AppState> {
    return this.getState();
  },
  async verifyEmail(): Promise<AppState> {
    return this.getState();
  },
  async handleNotifications(): Promise<AppState> {
    return this.getState();
  },
  async updateNotificationPreferences(): Promise<AppState> {
    return this.getState();
  },
  async getSnapshotCSV(): Promise<string> {
    return "id,totalMinedEcho\n";
  },
  async createStripeSession(): Promise<string> {
    return "dev_session";
  },
  async handleStripeWebhook(): Promise<AppState> {
    return this.getState();
  },
};