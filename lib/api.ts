// lib/api.ts
"use client";

import type { AppState, NotificationPreferences } from "./types";

type Json = Record<string, any>;

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  // Try to parse JSON even on errors
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/**
 * Client-side API bridge for ECHO Miner.
 * Talks to Next.js Route Handlers.
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

  // --- core state ---
  async getState(): Promise<AppState> {
    // Your /api/state supports GET
    const state = (await fetchJson("/api/state", { method: "GET" })) as AppState;
    this.saveLocal(state);
    return state;
  },

  async refreshState(): Promise<AppState> {
    const state = (await fetchJson("/api/mining/refresh", { method: "POST" })) as AppState;
    this.saveLocal(state);
    return state;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const state = (await fetchJson("/api/mining/start", {
      method: "POST",
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 10,
        multiplier: payload?.multiplier ?? 1,
      }),
    })) as AppState;

    this.saveLocal(state);
    return state;
  },

  // --- boosts ---
  async activateAdBoost(): Promise<AppState> {
    const state = (await fetchJson("/api/boost/activate", { method: "POST" })) as AppState;
    this.saveLocal(state);
    return state;
  },

  // --- profile ---
  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const state = (await fetchJson("/api/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    })) as AppState;

    this.saveLocal(state);
    return state;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const state = (await fetchJson("/api/profile/verify-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    })) as AppState;

    this.saveLocal(state);
    return state;
  },

  // --- notifications ---
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";
    const body: Json = {};
    if (id) body.id = id;
    if (action === "readAll") body.all = true;

    const state = (await fetchJson("/api/notifications", {
      method,
      body: JSON.stringify(body),
    })) as AppState;

    this.saveLocal(state);
    return state;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const state = (await fetchJson("/api/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ prefs }),
    })) as AppState;

    this.saveLocal(state);
    return state;
  },

  // --- snapshot export ---
  async getSnapshotCSV(): Promise<string> {
    const data = (await fetchJson("/api/snapshot", { method: "POST" })) as { csv?: string };
    return data.csv ?? "";
  },

  // --- store / stripe ---
  async createStripeSession(itemId: string): Promise<string> {
    const data = (await fetchJson("/api/store/checkout", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    })) as { sessionId?: string };

    if (!data.sessionId) throw new Error("No sessionId returned");
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const state = (await fetchJson("/api/store/webhook", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    })) as AppState;

    this.saveLocal(state);
    return state;
  },
};