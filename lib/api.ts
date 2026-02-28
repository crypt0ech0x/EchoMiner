// lib/api.ts
import { AppState, NotificationPreferences } from "./types";

type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: { address: string | null; verified: boolean; verifiedAt: string | null };
  user: { totalMinedEcho: number };
  session: {
    isActive: boolean;
    startedAt: string | null;
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

function mustOk(res: Response, body: any) {
  if (res.ok) return;
  const msg =
    body?.error ||
    body?.message ||
    `Request failed (${res.status})`;
  throw new Error(msg);
}

/**
 * Convert your new API shape -> your existing AppState shape (lib/types.ts)
 * so the UI doesn’t have to guess.
 */
function apiToAppState(api: ApiState, prev?: AppState): AppState {
  const now = Date.now();

  return {
    // --- user ---
    user: {
      ...(prev?.user ?? ({} as any)),
      totalMined: api.user.totalMinedEcho ?? 0, // your types.ts uses totalMined
    },

    // --- wallet ---
    walletAddress: api.wallet.address,
    walletVerifiedAt: api.wallet.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,
    currentNonce: prev?.currentNonce ?? null,

    // --- session (map to your existing MiningSession interface) ---
    session: {
      ...(prev?.session ?? ({} as any)),
      isActive: api.session.isActive,
      startTime: api.session.startedAt ? Date.parse(api.session.startedAt) : null,
      endTime: null, // you can compute this if you want (3h from startTime)
      baseRate: api.session.baseRatePerHr ?? 0,
      // your UI had multipliers split out; collapse into effectiveRate for now:
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: (api.session.baseRatePerHr ?? 0) * (api.session.multiplier ?? 1),
      status: api.session.isActive ? "active" : "ended",
    },

    // keep the rest of the legacy state so UI doesn’t crash
    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },
    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],
  };
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState {
    if (typeof window === "undefined") return null as any;
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : (null as any);
  },

  saveLocal(state: AppState) {
    if (typeof window !== "undefined") {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
  },

  async getState(): Promise<AppState> {
    const prev = typeof window !== "undefined" ? this.loadLocal() : undefined;

    const res = await fetch("/api/state", { method: "GET" });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);

    const api = body as ApiState;
    const next = apiToAppState(api, prev);
    this.saveLocal(next);
    return next;
  },

  async refreshState(): Promise<AppState> {
    // IMPORTANT: refresh route uses cookie server-side; don't send state.
    const res = await fetch("/api/mining/refresh", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);

    // refresh returns mining numbers, but easiest is: just refetch /api/state
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 10, // pick your default
        multiplier: payload?.multiplier ?? 1,
      }),
    });

    const body = await res.json().catch(() => ({}));
    mustOk(res, body);

    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);
    return await this.getState();
  },

  // Keep these so old UI calls don't break (adjust routes if you have them)
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    const res = await fetch("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);
    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const res = await fetch("/api/snapshot", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);
    return body.csv ?? "";
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    const body = await res.json().catch(() => ({}));
    mustOk(res, body);
    return await this.getState();
  },
};