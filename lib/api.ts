// lib/api.ts
import type {
  AppState,
  NotificationPreferences,
  NotificationType,
} from "./types";

/**
 * This is the shape returned by /api/state (server truth).
 * We convert it into the legacy AppState your UI expects.
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

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeStr(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function safeBool(v: unknown, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function parseDateMs(v: string | null): number | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
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
 * Convert server ApiState -> UI AppState (legacy shape).
 * We keep as much as possible from previous local state (prev),
 * but overwrite wallet + mined totals + session fields with server truth.
 */
function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const prevUser = prev?.user;

  const totalMined = safeNum(api?.user?.totalMinedEcho, 0);

  // Mining session: your UI expects "effectiveRate" (per second) and "baseRate" (per second)
  const baseRatePerHr = safeNum(api?.session?.baseRatePerHr, 0);
  const multiplier = safeNum(api?.session?.multiplier, 1);

  const baseRatePerSec = baseRatePerHr / 3600;
  const effectiveRatePerSec = baseRatePerSec * multiplier;

  const startedAtMs = parseDateMs(api?.session?.startedAt ?? null);
  const endAtMs =
    startedAtMs != null ? startedAtMs + 3 * 60 * 60 * 1000 : null; // 3 hours (matches your routes)

  const walletAddress = api?.wallet?.address ?? null;
  const walletVerifiedAtMs = parseDateMs(api?.wallet?.verifiedAt ?? null);

  return {
    user: {
      // keep existing fields so UI doesn't blow up
      id: prevUser?.id ?? "guest",
      username: prevUser?.username ?? "Voyager",
      balance: prevUser?.balance ?? 0,
      totalMined, // ✅ your types.ts expects totalMined
      referrals: prevUser?.referrals ?? 0,
      joinedDate: prevUser?.joinedDate ?? nowMs(),
      guest: prevUser?.guest ?? !api.authed,
      riskScore: prevUser?.riskScore ?? 0,
      referralCode: prevUser?.referralCode ?? "ECHO0000",
      isAdmin: prevUser?.isAdmin ?? false,
      priorityAirdrop: prevUser?.priorityAirdrop ?? false,
      pfpUrl: prevUser?.pfpUrl,
      email: prevUser?.email,
      emailVerified: prevUser?.emailVerified ?? false,
      notificationPreferences: prevUser?.notificationPreferences ?? defaultPrefs(),
    },

    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    session: {
      id: prev?.session?.id ?? "session",
      isActive: safeBool(api?.session?.isActive, false),
      startTime: startedAtMs,
      endTime: endAtMs,
      baseRate: baseRatePerSec,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: effectiveRatePerSec,
      status: safeBool(api?.session?.isActive, false) ? "active" : "ended",
    },

    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],

    // ✅ legacy wallet fields your UI uses
    walletAddress,
    walletVerifiedAt: walletVerifiedAtMs,
    currentNonce: prev?.currentNonce ?? null,
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    // IMPORTANT: sends your session cookie on Vercel
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
    },
  });

  // Helpful error if server returns HTML/error page
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
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

  /**
   * Always:
   *   /api/state (ApiState) -> AppState
   */
  async getState(): Promise<AppState> {
    const prev = this.loadLocal() ?? undefined;
    const api = (await fetchJson("/api/state", { method: "GET" })) as ApiState;

    // Guard so we never crash on missing wallet
    const safeApi: ApiState = {
      ok: !!api?.ok,
      authed: !!api?.authed,
      wallet: {
        address: api?.wallet?.address ?? null,
        verified: !!api?.wallet?.verified,
        verifiedAt: api?.wallet?.verifiedAt ?? null,
      },
      user: {
        totalMinedEcho: safeNum(api?.user?.totalMinedEcho, 0),
      },
      session: {
        isActive: !!api?.session?.isActive,
        startedAt: api?.session?.startedAt ?? null,
        lastAccruedAt: api?.session?.lastAccruedAt ?? null,
        baseRatePerHr: safeNum(api?.session?.baseRatePerHr, 0),
        multiplier: safeNum(api?.session?.multiplier, 1),
        sessionMined: safeNum(api?.session?.sessionMined, 0),
      },
    };

    const app = apiToAppState(safeApi, prev);
    this.saveLocal(app);
    return app;
  },

  /**
   * Hit refresh endpoint (server accrues mining), then re-pull /api/state.
   */
  async refreshState(): Promise<AppState> {
    await fetchJson("/api/mining/refresh", { method: "POST" });
    return await this.getState();
  },

  /**
   * Start a session server-side, then re-pull /api/state.
   */
  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const baseRatePerHr = safeNum(payload?.baseRatePerHr, 1);
    const multiplier = safeNum(payload?.multiplier, 1);

    await fetchJson("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRatePerHr, multiplier }),
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    await fetchJson("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    await fetchJson("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    return await this.getState();
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", { method: "POST" });
    return safeStr(data?.csv, "");
  },

  async createStripeSession(itemId: string): Promise<string> {
    const data = await fetchJson("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    return safeStr(data?.sessionId, "");
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    await fetchJson("/api/store/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return await this.getState();
  },
};