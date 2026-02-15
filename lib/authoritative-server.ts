
import { AppState, NotificationType, NotificationPreferences } from './types';

/**
 * Client-side Proxy for the Authoritative Backend.
 * Communicates with Next.js API routes under /app/api.
 */
export class AuthoritativeServer {
  private static STORAGE_KEY = 'echo_miner_authoritative_db';

  static async getState(): Promise<AppState> {
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
  }

  static saveState(state: AppState) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
  }

  static async refreshState(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/mining/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }

  static async startSession(): Promise<AppState> {
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
  }

  static async activateAdBoost(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/boost/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to activate boost");
    }
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }

  static async markNotificationAsRead(id: string): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, id })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }

  static async markAllAsRead(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, all: true })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }

  static async clearNotifications(): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }

  static async updatePFP(pfpUrl: string): Promise<AppState> {
    const state = await this.getState();
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, pfpUrl })
    });
    const newState = await res.json();
    this.saveState(newState);
    return newState;
  }
}
