import { AppState, NotificationPreferences } from "./types";

/**
 * Client-side API bridge for ECHO Miner.
 * - Keeps localStorage caching (safe-guarded)
 * - Calls Next.js API routes
 * - Includes ALL methods your UI components likely reference
 */
export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  // ---------- local cache helpers ----------
  loadLocal(): AppState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AppState;
    } catch {
      // If localStorage got corrupted, clear it so iPhone/Safari doesn't crash the app.
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch {}
      return null;
    }
  },

  saveLocal(state: AppState) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  },

  // ---------- core state ----------
  async getState(): Promise<AppState> {
    // Keep sending prior state for backwards compatibility with older /api/state implementations.
    const currentState = this.loadLocal();

    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // some newer versions of /api/state ignore this, older versions use it
      body: JSON.stringify({ state: currentState }),
      credentials: "include",
    });

    if (!res.ok) {
      // don't throw raw HTML pages etc.
      const text = await res.text().catch(() => "");
      throw new Error(text || `getState failed (${res.status})`);
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async refreshState(): Promise<AppState> {
    // Newer DB/cookie mining routes often ignore body state, but keeping it doesn’t hurt.
    const state = this.loadLocal();

    const res = await fetch("/api/mining/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `refreshState failed (${res.status})`);
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // if your start route is the DB version, it may read baseRatePerHr/multiplier from body
      body: JSON.stringify({
        state,
        baseRatePerHr: payload?.baseRatePerHr,
        multiplier: payload?.multiplier,
      }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Failed to start session");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async activateAdBoost(): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/boost/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Boost activation failed");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  // ---------- profile ----------
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, ...updates }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Profile update failed");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, email }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Email verification failed");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  // ---------- notifications ----------
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/notifications", {
      method: action === "clear" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, id, all: action === "readAll" }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Notifications update failed");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, prefs }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Preferences update failed");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  // ---------- snapshot export ----------
  async getSnapshotCSV(): Promise<string> {
    const state = this.loadLocal();

    const res = await fetch("/api/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Snapshot export failed");
    }

    const data = (await res.json()) as { csv: string };
    return data.csv ?? "";
  },

  // ---------- store ----------
  async createStripeSession(itemId: string): Promise<string> {
    const res = await fetch("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Checkout failed");
    }

    const data = (await res.json()) as { sessionId: string };
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const state = this.loadLocal();

    const res = await fetch("/api/store/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, sessionId }),
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || err?.message || "Webhook handling failed");
    }

    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },
};