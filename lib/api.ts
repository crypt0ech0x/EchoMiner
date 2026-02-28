// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

/**
 * Client-side API bridge for ECHO Miner.
 * Server is source of truth (session cookie auth).
 * We optionally cache the last state in localStorage for fast boot.
 */
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

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      // important: send cookies for auth
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    // Try parse json either way
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg =
        (data && (data.error || data.message)) ||
        `${url} failed (${res.status})`;
      throw new Error(msg);
    }

    return data as T;
  },

  // ------------------------
  // Core state
  // ------------------------
  async getState(): Promise<AppState> {
    // Use GET for state (simple + cache-friendly)
    const state = await this.fetchJson<AppState>("/api/state", { method: "GET" });
    this.saveLocal(state);
    return state;
  },

  async refreshState(): Promise<AppState> {
    // Your refresh route uses cookie; no need to send local state
    const refreshed = await this.fetchJson<AppState>("/api/mining/refresh", {
      method: "POST",
      body: JSON.stringify({}),
    });
    this.saveLocal(refreshed);
    return refreshed;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const body = {
      baseRatePerHr: payload?.baseRatePerHr ?? 1,
      multiplier: payload?.multiplier ?? 1,
    };

    const next = await this.fetchJson<AppState>("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(body),
    });

    this.saveLocal(next);
    return next;
  },

  async activateAdBoost(): Promise<AppState> {
    const next = await this.fetchJson<AppState>("/api/boost/activate", {
      method: "POST",
      body: JSON.stringify({}),
    });
    this.saveLocal(next);
    return next;
  },

  // ------------------------
  // Profile
  // ------------------------
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const next = await this.fetchJson<AppState>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    this.saveLocal(next);
    return next;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const next = await this.fetchJson<AppState>("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    this.saveLocal(next);
    return next;
  },

  // ------------------------
  // Notifications
  // ------------------------
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    const body =
      action === "read"
        ? { id }
        : action === "readAll"
          ? { all: true }
          : {};

    const next = await this.fetchJson<AppState>("/api/notifications", {
      method,
      body: JSON.stringify(body),
    });

    this.saveLocal(next);
    return next;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const next = await this.fetchJson<AppState>("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    this.saveLocal(next);
    return next;
  },

  // ------------------------
  // Snapshot export
  // ------------------------
  async getSnapshotCSV(): Promise<string> {
    const data = await this.fetchJson<{ csv: string }>("/api/snapshot", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return data.csv;
  },

  // ------------------------
  // Store / Stripe
  // ------------------------
  async createStripeSession(itemId: string): Promise<string> {
    const data = await this.fetchJson<{ sessionId: string }>("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const next = await this.fetchJson<AppState>("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    this.saveLocal(next);
    return next;
  },
};