// lib/api.ts
import { AppState, NotificationPreferences, WalletState } from "./types";

type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null;
  };
  user: {
    totalMinedEcho?: number;
    totalPurchasedEcho?: number;
    purchaseMultiplier?: number;
    referralMultiplier?: number;
    totalMined?: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null;
    lastAccruedAt: string | null;
    endsAt?: string | null;
    baseRatePerHr?: number;
    baseRate?: number;
    multiplier: number;
    sessionMined: number;
  };
  streak?: {
    currentStreak?: number;
    lastSessionEndAt?: string | null;
    graceEndsAt?: string | null;
    nextMultiplier?: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";
const CONNECTED_WALLET_KEY = "connected_wallet_address";
const SESSION_ID_KEY = "echo_session_id";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function getConnectedWalletAddress(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(CONNECTED_WALLET_KEY);
  } catch {
    return null;
  }
}

function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function defaultAppState(): AppState {
  const now = Date.now();

  return {
    authed: false,
    wallet: {
      address: null,
      verified: false,
      verifiedAt: null,
    },

    user: {
      id: "guest",
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      totalPurchased: 0,
      purchaseMultiplier: 1,
      referralMultiplier: 1,
      referrals: 0,
      joinedDate: now,
      guest: true,
      riskScore: 0,
      referralCode: "VOYAGER",
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
    },

    streak: {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
      nextMultiplier: 1,
    },

    session: {
      id: "sess",
      isActive: false,
      startTime: null,
      endTime: null,
      baseRate: 0,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: 0,
      status: "ended",
      sessionMined: 0,
      lastAccruedAt: null,
      baseRatePerHr: 0,
      multiplier: 1,
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

function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const incomingWalletAddr = api.wallet?.address ?? null;

  const shouldReset =
    !!prev &&
    !!incomingWalletAddr &&
    !!prev.walletAddress &&
    incomingWalletAddr !== prev.walletAddress;

  const base = shouldReset ? defaultAppState() : (prev ?? defaultAppState());

  const wallet: WalletState = {
    address: incomingWalletAddr,
    verified: !!api.wallet?.verified,
    verifiedAt: api.wallet?.verifiedAt ?? null,
  };

  const totalMinedEcho = Number(
    api.user?.totalMinedEcho ?? (api.user as any)?.totalMined ?? 0
  );

  const totalPurchasedEcho = Number(api.user?.totalPurchasedEcho ?? 0);
  const purchaseMultiplier = Number(api.user?.purchaseMultiplier ?? 1);
  const referralMultiplier = Number(api.user?.referralMultiplier ?? 1);

  const isActive = !!api.session?.isActive;
  const startedAtMs = api.session?.startedAt
    ? new Date(api.session.startedAt).getTime()
    : null;

  const lastAccruedAtMs = api.session?.lastAccruedAt
    ? new Date(api.session.lastAccruedAt).getTime()
    : null;

  const endsAtMs = api.session?.endsAt
    ? new Date(api.session.endsAt).getTime()
    : null;

  const baseRatePerHr = Number(
    api.session?.baseRatePerHr ?? (api.session as any)?.baseRate ?? 0
  );

  const multiplier = Number(api.session?.multiplier ?? 1);
  const sessionMined = Number(api.session?.sessionMined ?? 0);

  const effectiveRatePerSec =
    baseRatePerHr > 0 ? (baseRatePerHr * multiplier) / 3600 : 0;

  const fallbackEndTimeMs =
    startedAtMs != null ? startedAtMs + 24 * 60 * 60 * 1000 : null;

  return {
    ...base,

    authed: !!api.authed,
    wallet,

    walletAddress: wallet.address,
    walletVerifiedAt: wallet.verifiedAt
      ? new Date(wallet.verifiedAt).getTime()
      : null,

    user: {
      ...base.user,
      totalMined: totalMinedEcho,
      totalPurchased: totalPurchasedEcho,
      purchaseMultiplier,
      referralMultiplier,
      balance: totalMinedEcho + totalPurchasedEcho,
      guest: !api.authed,
    },

    streak: {
      ...base.streak,
      currentStreak: Number(api.streak?.currentStreak ?? 0),
      lastSessionStartAt: base.streak.lastSessionStartAt,
      lastSessionEndAt: api.streak?.lastSessionEndAt
        ? new Date(api.streak.lastSessionEndAt).getTime()
        : null,
      graceEndsAt: api.streak?.graceEndsAt
        ? new Date(api.streak.graceEndsAt).getTime()
        : null,
      nextMultiplier: Number(api.streak?.nextMultiplier ?? 1),
    },

    session: {
      ...base.session,
      isActive,
      status: isActive ? "active" : "ended",
      startTime: startedAtMs,
      endTime: endsAtMs ?? fallbackEndTimeMs,
      baseRate: baseRatePerHr / 3600,
      effectiveRate: effectiveRatePerSec,
      baseRatePerHr,
      multiplier,
      sessionMined,
      lastAccruedAt: lastAccruedAtMs,
      purchaseMultiplier,
    },
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const sessionId = getSessionId();

  const res = await fetch(url, {
    method: init?.method ?? "GET",
    body: init?.body,
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(sessionId ? { "x-session-id": sessionId } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.error || data?.message || `${res.status} ${res.statusText}`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const EchoAPI = {
  STORAGE_KEY,
  CONNECTED_WALLET_KEY,
  SESSION_ID_KEY,

  setConnectedWalletAddress(address: string | null) {
    if (typeof window === "undefined") return;
    try {
      if (address) {
        sessionStorage.setItem(CONNECTED_WALLET_KEY, address);
      } else {
        sessionStorage.removeItem(CONNECTED_WALLET_KEY);
      }
    } catch {
      // ignore
    }
  },

  setSessionId(sessionId: string | null) {
    if (typeof window === "undefined") return;
    try {
      if (sessionId) {
        localStorage.setItem(SESSION_ID_KEY, sessionId);
      } else {
        localStorage.removeItem(SESSION_ID_KEY);
      }
    } catch {
      // ignore
    }
  },

  getSessionId() {
    return getSessionId();
  },

  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    return safeJsonParse<AppState>(localStorage.getItem(STORAGE_KEY));
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  async getState(): Promise<AppState> {
    const prev = this.loadLocal();
    const api = (await fetchJson("/api/state")) as ApiState;
    const app = apiToAppState(api, prev);
    this.saveLocal(app);
    return app;
  },

  async refreshState(): Promise<AppState> {
    await fetchJson("/api/mining/refresh", {
      method: "POST",
    });
    return await this.getState();
  },

  async startSession(): Promise<AppState> {
    await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: getConnectedWalletAddress(),
      }),
    });

    return await this.getState();
  },

  async createStoreIntent(packageId: string) {
    return await fetchJson("/api/store/create-intent", {
      method: "POST",
      body: JSON.stringify({
        packageId,
        walletAddress: getConnectedWalletAddress(),
      }),
    });
  },

  async confirmStorePurchase(
    purchaseId: string,
    txSignature: string
  ): Promise<AppState> {
    await fetchJson("/api/store/confirm", {
      method: "POST",
      body: JSON.stringify({
        purchaseId,
        txSignature,
        walletAddress: getConnectedWalletAddress(),
      }),
    });

    return await this.getState();
  },

  async getSnapshotCSV(): Promise<string> {
    const data = await fetchJson("/api/snapshot", {
      method: "POST",
    });
    return String(data?.csv ?? "");
  },

  async activateAdBoost(): Promise<AppState> {
    try {
      await fetchJson("/api/boost/activate", {
        method: "POST",
      });
    } catch {
      // ignore
    }
    return await this.getState();
  },

  async updateProfile(updates: {
    pfpUrl?: string;
    username?: string;
  }): Promise<AppState> {
    try {
      await fetchJson("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    } catch {
      // ignore
    }
    return await this.getState();
  },

  async verifyEmail(email: string): Promise<AppState> {
    try {
      await fetchJson("/api/profile/verify-email", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // ignore
    }
    return await this.getState();
  },

  async handleNotifications(
    action: "read" | "readAll" | "clear",
    id?: string
  ): Promise<AppState> {
    try {
      const method = action === "clear" ? "DELETE" : "PATCH";
      await fetchJson("/api/notifications", {
        method,
        body: JSON.stringify({ action, id }),
      });
    } catch {
      // ignore
    }
    return await this.getState();
  },

  async updateNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<AppState> {
    try {
      await fetchJson("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ prefs }),
      });
    } catch {
      // ignore
    }
    return await this.getState();
  },
};