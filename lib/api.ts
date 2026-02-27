// lib/api.ts
import { AppState, ApiState } from "./types";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const now = Date.now();

  const totalMined = Number(api.user?.totalMinedEcho ?? 0);

  const startTime = api.session?.startedAt ? Date.parse(api.session.startedAt) : null;
  const endTime =
    api.session?.endsAt ? Date.parse(api.session.endsAt) : startTime ? startTime + 3 * 60 * 60 * 1000 : null;

  const baseRate = Number(api.session?.baseRatePerHr ?? 0);
  const multiplier = Number(api.session?.multiplier ?? 1);
  const effectiveRate = baseRate * multiplier;

  return {
    // --- user ---
    user: {
      id: prev?.user?.id ?? "server-user",
      username: prev?.user?.username ?? "Voyager",
      balance: prev?.user?.balance ?? 0,
      totalMined,
      referrals: prev?.user?.referrals ?? 0,
      joinedDate: prev?.user?.joinedDate ?? now,
      guest: false,
      riskScore: prev?.user?.riskScore ?? 0,
      referralCode: prev?.user?.referralCode ?? "ECHO",
      isAdmin: prev?.user?.isAdmin ?? false,
      priorityAirdrop: prev?.user?.priorityAirdrop ?? false,
      pfpUrl: prev?.user?.pfpUrl,
      email: prev?.user?.email,
      emailVerified: prev?.user?.emailVerified,
      notificationPreferences:
        prev?.user?.notificationPreferences ?? {
          session_end: true,
          streak_grace_warning: true,
          boost_expired: true,
          weekly_summary: true,
          airdrop_announcement: true,
        },
    },

    // --- streak (not implemented server-side yet; keep stable defaults) ---
    streak: prev?.streak ?? {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    // --- session ---
    session: {
      id: prev?.session?.id ?? "server-session",
      isActive: Boolean(api.session?.isActive),
      startTime,
      endTime,
      baseRate,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate,
      status: api.session?.isActive ? "active" : "ended",
      sessionMined: Number(api.session?.sessionMined ?? 0),
    },

    // --- other app stuff not backed by DB yet ---
    activeBoosts: prev?.activeBoosts ?? [],
    ledger: prev?.ledger ?? [],
    purchaseHistory: prev?.purchaseHistory ?? [],
    notifications: prev?.notifications ?? [],

    // --- wallet ---
    walletAddress: api.wallet?.address ?? null,
    walletVerifiedAt: api.wallet?.verifiedAt ? Date.parse(api.wallet.verifiedAt) : null,
    currentNonce: prev?.currentNonce ?? null,

    authed: Boolean(api.authed),
  };
}

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    return safeJsonParse<AppState>(localStorage.getItem(this.STORAGE_KEY));
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal();

    const res = await fetch("/api/state", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`getState failed (${res.status})`);
    }

    const api = (await res.json()) as ApiState;

    // basic sanity
    if (!api || typeof api.ok !== "boolean") {
      throw new Error("Bad state response from server");
    }

    const mapped = apiToAppState(api, prev);
    this.saveLocal(mapped);
    return mapped;
  },

  async refreshState(): Promise<AppState> {
    // refresh mining accrual on server (cookie-auth)
    const res = await fetch("/api/mining/refresh", {
      method: "POST",
      headers: { Accept: "application/json" },
    });

    // If not authed / not verified, server may return 401 — we still want UI to load.
    if (!res.ok) {
      // fall back to plain state so UI doesn’t crash
      return await this.getState();
    }

    // Your refresh route returns a “mining refresh payload”, not full AppState.
    // So we call getState after refresh to re-sync.
    return await this.getState();
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 10,
        multiplier: payload?.multiplier ?? 1,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Failed to start session");
    }

    // after starting, re-sync
    return await this.getState();
  },

  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", {
      method: "POST",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return await this.getState();
    return await this.getState();
  },

  // Keep these so your UI doesn’t fail TS builds if components call them.
  // If your server routes exist, these will work. If not, they’ll throw clearly.
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || "Profile update failed");
    }
    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const res = await fetch("/api/snapshot", { method: "POST", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Snapshot export failed");
    const data = await res.json();
    return data.csv ?? "";
  },
};