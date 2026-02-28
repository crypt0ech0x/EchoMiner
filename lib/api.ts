// lib/api.ts
import { AppState, NotificationPreferences } from "./types";

export const EchoAPI = {
  STORAGE_KEY: "echo_miner_state_v1",

  loadLocal(): AppState {
    if (typeof window === "undefined") return {} as AppState;
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : ({} as AppState);
  },

  saveLocal(state: AppState) {
    if (typeof window !== "undefined") {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
  },

  async getState(): Promise<AppState> {
    const res = await fetch("/api/state", { method: "GET" });
    if (!res.ok) throw new Error(`getState failed (${res.status})`);
    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async refreshState(): Promise<AppState> {
    // If your server refresh route needs POST:
    const res = await fetch("/api/mining/refresh", { method: "POST" });
    if (!res.ok) throw new Error(`refreshState failed (${res.status})`);
    const newState = (await res.json()) as AppState;
    this.saveLocal(newState);
    return newState;
  },

  async startSession(payload?: { baseRatePerHr?: number; multiplier?: number }): Promise<AppState> {
    const res = await fetch("/api/mining/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRatePerHr: payload?.baseRatePerHr ?? 1,
        multiplier: payload?.multiplier ?? 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Failed to start session");
    this.saveLocal(data as AppState);
    return data as AppState;
  },

  async activateAdBoost(): Promise<AppState> {
    const res = await fetch("/api/boost/activate", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Boost failed");
    this.saveLocal(data as AppState);
    return data as AppState;
  },

  // ✅ ADD THIS BACK (this fixes your ProfileDrawer compile error)
  async handleNotifications(action: "read" | "readAll" | "clear", id?: string): Promise<AppState> {
    const method = action === "clear" ? "DELETE" : "PATCH";

    const res = await fetch("/api/notifications", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        all: action === "readAll",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Notifications failed");
    this.saveLocal(data as AppState);
    return data as AppState;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Preferences update failed");
    this.saveLocal(data as AppState);
    return data as AppState;
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Profile update failed");
    this.saveLocal(data as AppState);
    return data as AppState;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const res = await fetch("/api/profile/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Email verify failed");
    this.saveLocal(data as AppState);
    return data as AppState;
  },

  async getSnapshotCSV(): Promise<string> {
    const res = await fetch("/api/snapshot", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || data?.message || "Snapshot failed");
    return String(data.csv ?? "");
  },
};