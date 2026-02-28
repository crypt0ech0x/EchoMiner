import type { AppState, NotificationPreferences } from "./types";

/**
 * This matches your /api/state response shape (server truth).
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

const SESSION_DURATION_SECONDS = 60 * 60 * 3;

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function toMs(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso);
  return Number.isFinite(t) ? t : null;
}

function emptyAppState(): AppState {
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
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
      emailVerified: false,
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
 * Map server state -> your existing AppState shape
 */
function mapApiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const base = prev ?? emptyAppState();

  const startedAtMs = toMs(api.session.startedAt);
  const endTimeMs =
    startedAtMs != null ? startedAtMs + SESSION_DURATION_SECONDS * 1000 : null;

  const baseRatePerSec = (api.session.baseRatePerHr ?? 0) / 3600;
  const effectiveRatePerSec =
    ((api.session.baseRatePerHr ?? 0) * (api.session.multiplier ?? 1)) / 3600;

  return {
    ...base,

    // --- wallet ---
    walletAddress: api.wallet.address,
    walletVerifiedAt: api.wallet.verifiedAt ? toMs(api.wallet.verifiedAt) : null,

    // --- user ---
    user: {
      ...base.user,
      guest: !api.authed,
      totalMined: api.user.totalMinedEcho ?? 0,
      // keep username/pfp/email/etc from local until you wire DB for those
    },

    // --- session ---
    session: {
      ...base.session,
      isActive: api.session.isActive,
      startTime: startedAtMs,
      endTime: api.session.isActive ? endTimeMs : endTimeMs,
      baseRate: baseRatePerSec,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: effectiveRatePerSec,
      status: api.session.isActive ? "active" : "ended",
      // NOTE: your MiningSession type does not include sessionMined; keep mined display using user.totalMined or effectiveRate over time
    },
  };
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState {
    if (typeof window === "undefined") return emptyAppState();
    const local = safeJsonParse<AppState>(localStorage.getItem(this.STORAGE_KEY));
    return local ?? emptyAppState();
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal();

    const res = await fetch("/api/state", {
      method: "GET",
      headers: { "Accept": "application/json" },
      // same-origin cookies (session cookie) are sent automatically; keep explicit for clarity
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`getState failed (${res.status})`);
    }

    const api = (await res.json()) as ApiState;
    const next = mapApiToAppState(api, prev);
    this.saveLocal(next);
    return next;
  },

  async refreshState(): Promise<AppState> {
    // 1) accrue mining server-side
    await fetch("/api/mining/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    }).catch(() => {
      // ignore refresh failure; state fetch will surface auth issues
    });

    // 2) fetch canonical state
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 60, // pick a default if your UI doesn't pass one
        multiplier: payload?.multiplier ?? 1,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Failed to start session");
    }

    // After starting, fetch canonical state
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Boost activation failed");
    }

    return await this.getState();
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Profile update failed");
    }

    // If your server doesn't persist profile yet, at least keep local updated:
    const current = this.loadLocal();
    const merged: AppState = {
      ...current,
      user: {
        ...current.user,
        ...(updates.username ? { username: updates.username } : {}),
        ...(updates.pfpUrl ? { pfpUrl: updates.pfpUrl } : {}),
      },
    };
    this.saveLocal(merged);

    // And still refresh canonical totals/wallet/session from server:
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    const res = await fetch("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Email verification failed");
    }

    // If server doesn't persist email yet, update local as optimistic:
    const current = this.loadLocal();
    const merged: AppState = {
      ...current,
      user: { ...current.user, email, emailVerified: true },
    };
    this.saveLocal(merged);

    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";

    const res = await fetch("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, id }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Notifications update failed");
    }

    // If your server returns full state, you could map it here.
    // For now, just refresh canonical server truth:
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ prefs }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Preference update failed");
    }

    // Keep local responsive:
    const current = this.loadLocal();
    const merged: AppState = {
      ...current,
      user: { ...current.user, notificationPreferences: prefs },
    };
    this.saveLocal(merged);

    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const res = await fetch("/api/snapshot", {
      method: "POST",
      headers: { "Accept": "application/json" },
      credentials: "same-origin",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Snapshot export failed");
    }

    const data = (await res.json()) as { csv?: string };
    return data.csv ?? "";
  },
};