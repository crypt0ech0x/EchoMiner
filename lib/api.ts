
import { AppState, NotificationType, NotificationPreferences } from './types';

/**
 * Client-side API bridge for ECHO Miner.
 * Communicates with Next.js API routes.
 */
export const EchoAPI = {
  STORAGE_KEY: 'echo_miner_state_v1',

  async getState(): Promise<AppState> {
    const local = typeof window !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY) : null;
    const currentState = local ? JSON.parse(local) : null;

    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: currentState })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  saveState(state: AppState) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
  },

  async refreshState(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/mining/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async startSession(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/mining/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to start session");
    }
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async activateAdBoost(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/boost/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async updateProfile(updates: { pfpUrl?: string; username?: string }): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, ...updates })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Profile update failed");
    }
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async handleNotifications(action: 'read' | 'readAll' | 'clear', id?: string): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/notifications', {
      method: action === 'clear' ? 'DELETE' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, id, all: action === 'readAll' })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, prefs })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async verifyEmail(email: string): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/profile/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, email })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  },

  async getSnapshotCSV(): Promise<string> {
    const state = await this.getState();
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    const data = await res.json();
    return data.csv;
  },

  async createStripeSession(itemId: string): Promise<string> {
    const res = await fetch('/api/store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
    const data = await res.json();
    return data.sessionId;
  },

  async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/store/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, sessionId })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }
};
