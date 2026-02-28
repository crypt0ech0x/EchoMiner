// lib/api.ts
import { AppState, NotificationPreferences, NotificationType } from "./types";

type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // ISO from server or null
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

// Your server uses a 3-hour session right now (matches your routes)
const SESSION_DURATION_SECONDS = 60 * 60 * 3;

function defaultPrefs(): NotificationPreferences {
  return {
    session_end: true,
    streak_grace_warning: true,
    boost_expired: true,
    weekly_summary: true,
    airdrop_announcement: true,
  };
}

function safeNumber(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const startedAtMs = api.session.startedAt ? Date.parse(api.session.startedAt) : null;
  const endTimeMs =
    startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const baseRatePerHr = safeNumber(api.session.baseRatePerHr, 0);
  const multiplier = safeNumber(api.session.multiplier, 1);

  const effectiveRatePerHr = baseRatePerHr * multiplier;
  const effectiveRatePerSec = effectiveRatePerHr / 3600;

  const sessionMined = safeNumber(api.session.sessionMined, 0);
  const totalMinedEcho = safeNumber(api.user.totalMinedEcho, 0);

  // KEY FIX:
  // If totalMinedEcho already includes session accruals (it does in your refresh route),
  // then the UI must not double-add session earnings.
  // MineTab does: currentTotal = balance + (isActive ? sessionEarnings : 0)
  // So set balance to "total minus session so far" while active.
  const balance =
    api.session.isActive ? Math.max(0, totalMinedEcho - sessionMined) : totalMinedEcho;

  const prevUser = prev?.user;

  return {
    // --- user ---
    user: {
      id: prevUser?.id ?? "guest",
      username: prevUser?.username ?? "Voyager",
      balance,
      totalMined: totalMinedEcho, // this is your canonical total
      referrals: prevUser?.referrals ?? 0,
      joinedDate: prevUser?.joinedDate ?? Date.now(),
      guest: !api.authed,
      riskScore: prevUser?.riskScore ?? 0,
      referralCode: prevUser?.referralCode ?? "ECHO",
      isAdmin: prevUser?.isAdmin ?? false,
      priorityAirdrop: prevUser?.priorityAirdrop ?? false,
      pfpUrl: prevUser?.pfpUrl,
      email: prevUser?.email,
      emailVerified: prevUser?.emailVerified ?? false,
      notificationPreferences: prevUser?.notificationPreferences ?? defaultPrefs(),
    },

    // --- streak (leave your existing system intact for now) ---
    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    // --- session (mapped from DB/server) ---
    session: {
      id: prev?.session?.id ?? "session",
      isActive: !!api.session.isActive,
      startTime: startedAtMs,
      endTime: api.session.isActive ? endTimeMs : null,
      baseRate: baseRatePerHr / 3600, // (legacy field) rate per second
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: multiplier, // easiest mapping
      effectiveRate: effectiveRatePerSec, // this is what MineTab/page.ts uses
      status: api.session.isActive ? "active" : "ended",
    },

    // --- keep your UI arrays stable ---
    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],

    // --- wallet fields your UI expects ---
    walletAddress: api.wallet.address,
    walletVerifiedAt: api.wallet.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,
    currentNonce: prev?.currentNonce ?? null,
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.error || data?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return res.json();
}

export const EchoAPI = {
  STORAGE_KEY,

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      return null;
    }
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal() ?? undefined;
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    // tells server to accrue time; then we re-fetch canonical state
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
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
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ action, id }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    return await this.getState();
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
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};