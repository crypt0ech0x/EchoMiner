// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * This is the SERVER response shape from /api/state now.
 * (Matches what you pasted: { ok, authed, wallet, user, session })
 */
export type ApiState = {
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

/**
 * Convert server ApiState -> your existing AppState used by components.
 * IMPORTANT: This keeps backwards-compat fields that your UI expects:
 * - state.user.totalMined
 * - state.walletAddress
 * - state.session.sessionMined (or earnings)
 */
function apiToAppState(api: ApiState, prev: AppState | null): AppState {
  // Start from previous state so we don't blow away UI-only fields
  const base: any = prev ? structuredClone(prev) : {};

  // --- user ---
  base.user = {
    ...(base.user ?? {}),
    // Your UI expects totalMined (NOT totalMinedEcho)
    totalMined: api.user?.totalMinedEcho ?? 0,
  };

  // --- wallet ---
  base.walletAddress = api.wallet?.address ?? null;
  base.walletVerified = !!api.wallet?.verified;
  base.walletVerifiedAt = api.wallet?.verifiedAt ?? null;
  base.authed = !!api.authed;

  // --- session ---
  base.session = {
    ...(base.session ?? {}),
    isActive: !!api.session?.isActive,
    baseRatePerHr: api.session?.baseRatePerHr ?? 0,
    multiplier: api.session?.multiplier ?? 1,
    // Your new server tracks this directly
    sessionMined: api.session?.sessionMined ?? 0,

    // Optional legacy fields some UIs use:
    startTime: api.session?.startedAt ? new Date(api.session.startedAt).getTime() : null,
    effectiveRate:
      ((api.session?.baseRatePerHr ?? 0) * (api.session?.multiplier ?? 1)) / 3600, // per-sec if old code expects per-sec
    baseRate: (api.session?.baseRatePerHr ?? 0) / 3600,
  };

  return base as AppState;
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

  // ---- STATE ----
  async getState(): Promise<AppState> {
    const prev = this.loadLocal();

    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Your new server doesn't need the old state, but sending it doesn't hurt.
      body: JSON.stringify({ state: prev }),
      cache: "no-store",
    });

    const api = (await res.json()) as ApiState;

    // Basic guard so we don't crash the whole app
    if (!api || typeof api !== "object" || typeof (api as any).ok !== "boolean") {
      throw new Error("Bad /api/state response");
    }

    const next = apiToAppState(api, prev);
    this.saveLocal(next);
    return next;
  },

  // ---- MINING ----
  async refreshState(): Promise<AppState> {
    // Your /api/mining/refresh route now uses cookie auth + DB; no need to send state.
    const res = await fetch("/api/mining/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    // If refresh errors (401 when not authed), fall back to state
    if (!res.ok) return await this.getState();

    const data = await res.json().catch(() => null);

    // Most of your routes return “state-ish” objects; safest is: refetch canonical state.
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 100, // pick a sane default
        multiplier: payload?.multiplier ?? 1,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || err?.message || "Failed to start session");
    }

    return await this.getState();
  },

  // ---- BOOST ----
  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || err?.message || "Boost failed");
    }

    return await this.getState();
  },

  // ---- PROFILE / NOTIFICATIONS (keep these so builds don’t break) ----
  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ prefs }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || err?.message || "Preferences update failed");
    }

    return await this.getState();
  },

  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const res = await fetch("/api/notifications", {
      method: action === "clear" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ id, all: action === "readAll" }),
    });

    if (!res.ok) return await this.getState();
    return await this.getState();
  },

  // ---- SNAPSHOT (fixes your build error: EchoAPI.getSnapshotCSV missing) ----
  async getSnapshotCSV(): Promise<string> {
    const res = await fetch("/api/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || err?.message || "Snapshot export failed");
    }

    const data = (await res.json()) as { csv?: string };
    return data.csv ?? "";
  },
};