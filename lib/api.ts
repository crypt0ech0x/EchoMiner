// lib/api.ts
import {
  AppState,
  NotificationPreferences,
  NotificationType,
  Tab,
} from "./types";

/**
 * This matches what your /api/state returns now:
 * {
 *   ok: true,
 *   authed: boolean,
 *   wallet: { address, verified, verifiedAt },
 *   user: { totalMinedEcho },
 *   session: { isActive, startedAt, lastAccruedAt, baseRatePerHr, multiplier, sessionMined }
 * }
 */
type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null; // serialized date string or null
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null; // serialized
    lastAccruedAt: string | null; // serialized
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

// --- helpers ---
async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  // Helpful error text instead of “client-side exception”
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}) ${text || ""}`.trim());
  }

  return res.json();
}

function nowMs() {
  return Date.now();
}

// Your mining session duration is 3 hours in the API routes
const SESSION_DURATION_SECONDS = 60 * 60 * 3;

function safeParseTimeMs(input: string | null | undefined): number | null {
  if (!input) return null;
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Convert API state (server truth) → AppState (your UI shape in lib/types.ts).
 * We preserve anything your UI expects from older local state by merging with `prev`.
 */
function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const total = Number(api?.user?.totalMinedEcho ?? 0);

  const startedAtMs = safeParseTimeMs(api.session?.startedAt);
  const lastAccruedAtMs = safeParseTimeMs(api.session?.lastAccruedAt);

  const baseRatePerHr = Number(api.session?.baseRatePerHr ?? 0);
  const multiplier = Number(api.session?.multiplier ?? 1);

  // UI expects effectiveRate as "ECHO per second" (MineTab uses effectiveRate * 3600 for E/H)
  const effectiveRatePerSec = (baseRatePerHr * multiplier) / 3600;

  const endTimeMs =
    startedAtMs != null
      ? startedAtMs + SESSION_DURATION_SECONDS * 1000
      : null;

  // Build a session object that matches your UI MiningSession interface
  const session = {
    ...(prev?.session as any),
    id: (prev?.session as any)?.id ?? "session",
    isActive: !!api.session?.isActive,
    startTime: startedAtMs,
    endTime: endTimeMs,
    baseRate: baseRatePerHr,
    streakMultiplier: (prev?.session as any)?.streakMultiplier ?? 1,
    boostMultiplier: (prev?.session as any)?.boostMultiplier ?? 1,
    purchaseMultiplier: (prev?.session as any)?.purchaseMultiplier ?? 1,
    effectiveRate: effectiveRatePerSec,
    status: api.session?.isActive ? "active" : "ended",

    // EXTRA fields your page.tsx can use if you want (won’t break anything)
    lastAccruedAt: lastAccruedAtMs,
    sessionMined: Number(api.session?.sessionMined ?? 0),
    multiplier,
  } as any;

  const merged: AppState = {
    // --- NEW fields so your app/page.tsx can use server truth ---
    ...(prev as any),

    authed: !!api.authed,
    wallet: {
      address: api.wallet?.address ?? null,
      verified: !!api.wallet?.verified,
      verifiedAt: api.wallet?.verifiedAt ?? null,
    },

    // --- user ---
    user: {
      ...(prev?.user as any),
      id: (prev?.user as any)?.id ?? "user",
      username: (prev?.user as any)?.username ?? "Voyager",
      // IMPORTANT: MineTab displays user.balance, so we map server total mined into balance
      balance: total,
      totalMined: total,
      referrals: (prev?.user as any)?.referrals ?? 0,
      joinedDate: (prev?.user as any)?.joinedDate ?? Date.now(),
      guest: (prev?.user as any)?.guest ?? false,
      riskScore: (prev?.user as any)?.riskScore ?? 0,
      referralCode: (prev?.user as any)?.referralCode ?? "ECHO",
      notificationPreferences:
        (prev?.user as any)?.notificationPreferences ?? {
          session_end: true,
          streak_grace_warning: true,
          boost_expired: true,
          weekly_summary: true,
          airdrop_announcement: true,
        },
      pfpUrl: (prev?.user as any)?.pfpUrl,
      email: (prev?.user as any)?.email,
      emailVerified: (prev?.user as any)?.emailVerified ?? false,
      isAdmin: (prev?.user as any)?.isAdmin ?? false,
      priorityAirdrop: (prev?.user as any)?.priorityAirdrop ?? false,
    },

    // --- streak (keep your old system, don’t break UI) ---
    streak: (prev?.streak as any) ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    // --- session (mapped from DB) ---
    session,

    // --- keep existing arrays so UI doesn’t explode ---
    activeBoosts: (prev?.activeBoosts ?? []) as any,
    ledger: (prev?.ledger ?? []) as any,
    purchaseHistory: (prev?.purchaseHistory ?? []) as any,
    notifications: (prev?.notifications ?? []) as any,

    // --- legacy fields your older UI references ---
    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: api.wallet?.verifiedAt
      ? new Date(api.wallet.verifiedAt).getTime()
      : null,
    currentNonce: prev?.currentNonce ?? null,
  };

  return merged;
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

  // --- State ---
  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  // --- Mining ---
  async refreshState(): Promise<AppState> {
    // refresh accrual on server (cookie-auth)
    const api = (await fetchJson("/api/mining/refresh", {
      method: "POST",
    })) as ApiState | any;

    // Some refresh routes return the same shape, some return {ok,wallet,user,session,...}
    // Normalize by fetching /api/state after refresh so UI always stays consistent.
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });

    // After starting, re-fetch full state so UI gets startedAt/lastAccruedAt/etc
    return await this.getState();
  },

  // --- Boost (if you still have the route) ---
  async activateAdBoost(): Promise<AppState> {
    await fetchJson("/api/boost/activate", { method: "POST" });
    return await this.getState();
  },

  // --- Profile ---
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

  // --- Notifications ---
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify({ id, all: action === "readAll" }),
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

  // --- Snapshot export ---
  async getSnapshotCSV(): Promise<string> {
    const data = (await fetchJson("/api/snapshot", { method: "POST" })) as { csv: string };
    return data.csv;
  },

  // --- Store / Stripe (if you still have these routes) ---
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