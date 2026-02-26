// lib/api.ts
import { AppState } from "./types";

/**
 * Shape returned by /api/state in your new server-driven version
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
  // server may include other fields; we ignore them safely
  [k: string]: any;
};

function safeLoad<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // If it’s corrupted/old schema, wipe it so the app can boot
    try {
      localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

function safeSave(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode errors
  }
}

/**
 * Convert server ApiState -> your existing AppState shape (keep UI stable)
 * IMPORTANT: This assumes your UI expects:
 * - state.user.totalMined
 * - state.walletAddress
 * - state.session fields used by MineTab
 *
 * If your AppState differs slightly, adjust only this mapper.
 */
function toAppState(api: ApiState, prev: AppState | null): AppState {
  const base: any = prev ?? {};

  // Keep any UI-only fields you had before, but overwrite server-truth parts.
  const next: any = {
    ...base,

    // ---- user ----
    user: {
      ...(base.user ?? {}),
      totalMined: api.user?.totalMinedEcho ?? 0,
    },

    // ---- wallet ----
    walletAddress: api.wallet?.address ?? null,
    walletVerified: !!api.wallet?.verified,

    // ---- session ----
    session: {
      ...(base.session ?? {}),
      isActive: !!api.session?.isActive,
      startedAt: api.session?.startedAt ? Date.parse(api.session.startedAt) : null,
      lastAccruedAt: api.session?.lastAccruedAt ? Date.parse(api.session.lastAccruedAt) : null,
      baseRatePerHr: api.session?.baseRatePerHr ?? 0,
      multiplier: api.session?.multiplier ?? 1,
      sessionMined: api.session?.sessionMined ?? 0,
    },

    // Optional: keep these around if your UI checks them
    authed: !!api.authed,
    ok: !!api.ok,
  };

  return next as AppState;
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v2",

  async getState(): Promise<AppState> {
    const prev = safeLoad<AppState>(this.STORAGE_KEY);

    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // server no longer needs client state; keep body minimal
      body: JSON.stringify({}),
      cache: "no-store",
      credentials: "include",
    });

    const api = (await res.json()) as ApiState;

    if (!api || typeof api !== "object" || typeof api.ok !== "boolean") {
      throw new Error("Bad /api/state response");
    }

    const next = toAppState(api, prev);
    safeSave(this.STORAGE_KEY, next);
    return next;
  },

  async refreshState(): Promise<AppState> {
    // IMPORTANT: mining/refresh route uses cookie now; don’t send local state
    const res = await fetch("/api/mining/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    // If refresh returns ApiState, map it. If it returns AppState, accept it.
    if (data && typeof data === "object" && typeof data.ok === "boolean" && "wallet" in data) {
      const prev = safeLoad<AppState>(this.STORAGE_KEY);
      const next = toAppState(data as ApiState, prev);
      safeSave(this.STORAGE_KEY, next);
      return next;
    }

    safeSave(this.STORAGE_KEY, data);
    return data as AppState;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Failed to start session");

    // after start, best practice: re-fetch truth from /api/state
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Boost failed");

    return await this.getState();
  },

  // You can update the other calls later the same way (stop sending {state})
};