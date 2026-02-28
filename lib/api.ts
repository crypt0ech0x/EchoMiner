// lib/api.ts
import type { AppState, NotificationPreferences } from "./types";

type Json = Record<string, any>;

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  // ---------- local storage ----------
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

  // ---------- typed fetch helper ----------
  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // important for cookie-based auth on same-origin
      credentials: "same-origin",
    });

    // Try to read JSON either way so we can show useful errors
    const data = (await res.json().catch(() => null)) as any;

    if (!res.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `Request failed (${res.status}) for ${url}`;
      throw new Error(msg);
    }

    return data as T;
  },

  // ---------- core state ----------
  async getState(): Promise<AppState> {
    // Your /api/state supports GET now
    const state = await this.fetchJson<AppState>("/api/state", { method: "GET" });
    this.saveLocal(state);
    return state;
  },

  async refreshState(): Promise<AppState> {
    // Your server refresh route uses cookie auth; no need to send local state
    const state = await this.fetchJson<AppState>("/api/mining/refresh", { method: "POST" });
    this.saveLocal(state);
    return state;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const body = {
      baseRatePerHr: payload?.baseRatePerHr ?? 1, // pick a sane default
      multiplier: payload?.multiplier ?? 1,
    };

    const state = await this.fetchJson<AppState>("/api/mining/start", {
      method: "POST",
      body: JSON.stringify(body),
    });

    this.saveLocal(state);
    return state;
  },

  async activateAdBoost(): Promise<AppState> {
    const state = await this.fetchJson<AppState>("/api/boost/activate", { method: "POST" });
    this.saveLocal(state);
    return state;
  },

  // ---------- profile ----------
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const state = await this.fetchJson<AppState>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    this.saveLocal(state);
    return state;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const state = await this.fetchJson<AppState>("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    this.saveLocal(state);
    return state;
  },

  // ---------- notifications ----------
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    const body =
      action === "clear"
        ? {}
        : action === "readAll"
          ? { all: true }
          : { id };

    const state = await this.fetchJson<AppState>("/api/notifications", {
      method,
      body: JSON.stringify(body),
    });

    this.saveLocal(state);
    return state;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const state = await this.fetchJson<AppState>("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    });
    this.saveLocal(state);
    return state;
  },

  // ---------- snapshot / export ----------
  async getSnapshotCSV(): Promise<string> {
    const data = await this.fetchJson<{ csv: string }>("/api/snapshot", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return data.csv;
  },

  // ---------- store ----------
  async createStripeSession(itemId: string): Promise<string> {
    const data = await this.fetchJson<{ sessionId: string }>("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const state = await this.fetchJson<AppState>("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    this.saveLocal(state);
    return state;
  },
};