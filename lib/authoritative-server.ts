
import { 
  AppState, 
  NotificationType, 
  NotificationPreferences,
  ActiveBoost,
  MiningSession
} from './types';
import { 
  BASE_MINING_RATE, 
  SESSION_DURATION_MS, 
  STREAK_GRACE_PERIOD_MS, 
  GET_STREAK_MULTIPLIER,
  AD_BOOST_DURATION_MS,
  AD_BOOST_MULTIPLIER,
  AD_BOOST_MAX_QUEUE_MS,
  STORE_ITEMS
} from './constants';

export class AuthoritativeServer {
  private static STORAGE_KEY = 'echo_miner_authoritative_db';

  static async getState(): Promise<AppState> {
    if (typeof window === 'undefined') return this.initializeNewUser();
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) return this.initializeNewUser();
    return JSON.parse(data);
  }

  static async saveState(state: AppState) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
  }

  private static initializeNewUser(): AppState {
    const now = Date.now();
    const refCode = 'ECHO' + Math.floor(1000 + Math.random() * 9000);
    return {
      user: {
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        username: refCode,
        balance: 0,
        totalMined: 0,
        referrals: 0,
        joinedDate: now,
        guest: true,
        riskScore: 0,
        referralCode: refCode,
        isAdmin: false,
        priorityAirdrop: false,
        notificationPreferences: {
          session_end: true,
          streak_grace_warning: true,
          boost_expired: true,
          weekly_summary: true,
          airdrop_announcement: true
        }
      },
      streak: { currentStreak: 0, lastSessionStartAt: null, lastSessionEndAt: null, graceEndsAt: null },
      session: {
        id: '', isActive: false, startTime: null, endTime: null, baseRate: BASE_MINING_RATE,
        streakMultiplier: 1, boostMultiplier: 1, purchaseMultiplier: 1, effectiveRate: 0, status: 'ended'
      },
      activeBoosts: [], ledger: [], purchaseHistory: [], notifications: [],
      walletAddress: null, walletVerifiedAt: null, currentNonce: null
    };
  }

  static async startSession(): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    if (state.session.isActive) throw new Error("Session already active");

    let newStreak = state.streak.currentStreak;
    if (state.streak.graceEndsAt && now > state.streak.graceEndsAt) newStreak = 1;
    else newStreak += 1;

    const streakMult = GET_STREAK_MULTIPLIER(newStreak);
    const refMult = 1 + (state.user.referrals * 0.25);
    const adMult = state.activeBoosts.filter(b => b.type === 'AD' && b.expiresAt > now).reduce((acc, b) => acc * b.multiplier, 1.0);
    const storeMult = state.activeBoosts.filter(b => b.type === 'STORE' && b.expiresAt > now).reduce((acc, b) => acc * b.multiplier, 1.0);

    const sessionId = 'sess_' + now;
    state.session = {
      id: sessionId, isActive: true, startTime: now, endTime: now + SESSION_DURATION_MS,
      baseRate: BASE_MINING_RATE, streakMultiplier: streakMult, boostMultiplier: adMult * refMult,
      purchaseMultiplier: storeMult, effectiveRate: BASE_MINING_RATE * streakMult * adMult * refMult * storeMult,
      status: 'active'
    };
    state.streak.currentStreak = newStreak;
    state.streak.lastSessionStartAt = now;
    state.streak.graceEndsAt = null;

    state.ledger.push({ id: 'led_start_' + now, timestamp: now, deltaEcho: 0, reason: 'session_start', sessionId, hash: btoa('start' + sessionId + now) });
    await this.saveState(state);
    return state;
  }

  static async activateAdBoost(): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    const existing = state.activeBoosts.find(b => b.type === 'AD' && b.expiresAt > now);
    let startAt = now;
    if (existing) {
      if (existing.expiresAt - now >= AD_BOOST_MAX_QUEUE_MS) throw new Error("Queue full");
      startAt = existing.expiresAt;
    }
    const newBoost: ActiveBoost = { id: 'boost_ad_' + now, type: 'AD', multiplier: AD_BOOST_MULTIPLIER, startAt, expiresAt: startAt + AD_BOOST_DURATION_MS };
    if (existing) existing.expiresAt += AD_BOOST_DURATION_MS;
    else state.activeBoosts.push(newBoost);

    state.ledger.push({ id: 'led_boost_' + now, timestamp: now, deltaEcho: 0, reason: 'boost_activation', hash: btoa('boost' + now) });
    this.recalculateRate(state, now);
    await this.saveState(state);
    return state;
  }

  private static recalculateRate(state: AppState, now: number) {
    if (!state.session.isActive) return;
    const refMult = 1 + (state.user.referrals * 0.25);
    const adMult = state.activeBoosts.filter(b => b.type === 'AD' && b.expiresAt > now).reduce((acc, b) => acc * b.multiplier, 1.0);
    const storeMult = state.activeBoosts.filter(b => b.type === 'STORE' && b.expiresAt > now).reduce((acc, b) => acc * b.multiplier, 1.0);
    state.session.boostMultiplier = adMult * refMult;
    state.session.purchaseMultiplier = storeMult;
    state.session.effectiveRate = state.session.baseRate * state.session.streakMultiplier * adMult * refMult * storeMult;
  }
  
  static async settleSessions(): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    if (state.session.isActive && state.session.endTime && now >= state.session.endTime) {
      const durationSec = (state.session.endTime - (state.session.startTime || 0)) / 1000;
      const earnings = durationSec * state.session.effectiveRate;
      state.user.balance += earnings;
      state.user.totalMined += earnings;
      state.ledger.push({ id: 'led_settle_' + now, timestamp: now, deltaEcho: earnings, reason: 'session_settlement', sessionId: state.session.id, hash: btoa(state.session.id + earnings) });
      state.streak.lastSessionEndAt = state.session.endTime;
      state.streak.graceEndsAt = state.session.endTime + STREAK_GRACE_PERIOD_MS;
      state.session.isActive = false;
      state.session.status = 'settled';
      await this.saveState(state);
    }
    return state;
  }

  static async updatePFP(pfpUrl: string): Promise<AppState> {
    const state = await this.getState();
    state.user.pfpUrl = pfpUrl;
    await this.saveState(state);
    return state;
  }
}
