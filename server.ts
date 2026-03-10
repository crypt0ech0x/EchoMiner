
import { 
  AppState, 
  MiningSession, 
  LedgerEntry, 
  ActiveBoost, 
  StoreItem,
  PurchaseHistoryEntry,
  AppNotification,
  NotificationType,
  NotificationPreferences
} from '@/lib/types';
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

class EmailService {
  static async send(to: string, type: NotificationType, title: string, body: string) {
    // In a real app, this would use fetch('https://api.resend.com/emails', ...)
    console.log(`%c[ECHO EMAIL SENT to ${to}]`, 'color: #2DD4BF; font-weight: bold; background: #020617; padding: 4px; border-radius: 4px;');
    console.log(`%cSubject: ${title}`, 'font-weight: bold;');
    console.log(`%c--- TEMPLATE ---`, 'color: #8B5CF6;');
    console.log(`
      <div style="background: #020617; color: white; padding: 40px; font-family: sans-serif;">
        <h1 style="color: #8B5CF6;">ECHO MINER</h1>
        <p style="font-size: 18px;">Hello Voyager,</p>
        <p>${body}</p>
        <div style="margin-top: 40px; border-top: 1px solid #334155; padding-top: 20px; font-size: 12px; color: #94A3B8;">
          You received this because your email is verified. <a href="#" style="color: #2DD4BF;">Unsubscribe</a>
        </div>
      </div>
    `);
  }
}

export class AuthoritativeServer {
  private static STORAGE_KEY = 'echo_miner_authoritative_db';
  private static TAKEN_USERNAMES = new Set(['Satoshi', 'Vitalik', 'SolanaKing', 'EchoDev']);

  static async getState(): Promise<AppState> {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) return this.initializeNewUser();
    const state = JSON.parse(data);
    
    // Migrations for new properties
    if (!state.user.username) state.user.username = state.user.referralCode;
    if (!state.notifications) state.notifications = [];
    if (!state.user.notificationPreferences) {
      state.user.notificationPreferences = {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true
      };
    }
    
    return state;
  }

  private static async saveState(state: AppState) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
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
  totalPurchased: 0,
  purchaseMultiplier: 1,
  referralMultiplier: 1,
  referrals: 0,
  joinedDate: Date.now(),
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
    airdrop_announcement: true,
        }
      },
      streak: {
  currentStreak: 0,
  lastSessionStartAt: null,
  lastSessionEndAt: null,
  graceEndsAt: null,
  nextMultiplier: 1,
},
      session: {
        id: '',
        isActive: false,
        startTime: null,
        endTime: null,
        baseRate: BASE_MINING_RATE,
        streakMultiplier: 1,
        boostMultiplier: 1,
        purchaseMultiplier: 1,
        effectiveRate: 0,
        status: 'ended'
      },
      activeBoosts: [],
      ledger: [],
      purchaseHistory: [],
      notifications: [],
      walletAddress: null,
      walletVerifiedAt: null,
      currentNonce: null
    };
  }

  static async updateUsername(newUsername: string): Promise<AppState> {
    const state = await this.getState();
    const normalized = newUsername.trim();
    if (normalized.length < 3) throw new Error("Username too short.");
    if (normalized.length > 20) throw new Error("Username too long.");
    if (!state.user.isAdmin && normalized.toLowerCase() === 'admin') throw new Error("The name 'Admin' is reserved.");
    if (this.TAKEN_USERNAMES.has(normalized) && normalized !== state.user.username) throw new Error("Username is already taken.");
    state.user.username = normalized;
    await this.saveState(state);
    return state;
  }

  static async addNotification(type: NotificationType, title: string, body: string, actionUrl?: string): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    
    // Check if a similar notification was sent recently to avoid spam (throttling)
    const recent = state.notifications.find(n => n.type === type && now - n.createdAt < 3600000); // 1 hour throttle
    if (recent && type !== 'airdrop_announcement') return state;

    const notif: AppNotification = {
      id: 'notif_' + Math.random().toString(36).substr(2, 9),
      type,
      title,
      body,
      createdAt: now,
      readAt: null,
      actionUrl
    };

    state.notifications.unshift(notif);
    
    // Send email if applicable
    if (state.user.email && state.user.emailVerified && state.user.notificationPreferences[type]) {
      EmailService.send(state.user.email, type, title, body);
    }

    await this.saveState(state);
    return state;
  }

  static async markNotificationAsRead(id: string): Promise<AppState> {
    const state = await this.getState();
    const notif = state.notifications.find(n => n.id === id);
    if (notif) notif.readAt = Date.now();
    await this.saveState(state);
    return state;
  }

  static async markAllAsRead(): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    state.notifications.forEach(n => { if (!n.readAt) n.readAt = now; });
    await this.saveState(state);
    return state;
  }

  static async clearNotifications(): Promise<AppState> {
    const state = await this.getState();
    state.notifications = [];
    await this.saveState(state);
    return state;
  }

  static async updateNotificationPreferences(prefs: NotificationPreferences): Promise<AppState> {
    const state = await this.getState();
    state.user.notificationPreferences = prefs;
    await this.saveState(state);
    return state;
  }

  static async verifyEmail(email: string): Promise<AppState> {
    const state = await this.getState();
    state.user.email = email;
    state.user.emailVerified = true; // Simulated instant verification
    await this.saveState(state);
    return state;
  }

  static async startSession(): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    if (state.session.isActive) throw new Error("Session already active");

    let newStreak = state.streak.currentStreak;
    if (state.streak.graceEndsAt && now > state.streak.graceEndsAt) {
      newStreak = 1; 
    } else {
      newStreak += 1;
    }

    const streakMult = GET_STREAK_MULTIPLIER(newStreak);
    const refMult = 1 + (state.user.referrals * 0.25); // +25% per referral
    const adMult = state.activeBoosts.filter(b => b.type === 'AD' && b.expiresAt > now).reduce((acc, b) => acc * b.multiplier, 1.0);
    const storeMult = state.activeBoosts.filter(b => b.type === 'STORE' && b.expiresAt > now).reduce((acc, b) => acc * b.multiplier, 1.0);

    const sessionId = 'sess_' + now;
    state.session = {
      id: sessionId,
      isActive: true,
      startTime: now,
      endTime: now + SESSION_DURATION_MS,
      baseRate: BASE_MINING_RATE,
      streakMultiplier: streakMult,
      boostMultiplier: adMult * refMult, // Combined network/ad boosts
      purchaseMultiplier: storeMult,
      effectiveRate: BASE_MINING_RATE * streakMult * adMult * refMult * storeMult,
      status: 'active'
    };
    state.streak.currentStreak = newStreak;
    state.streak.lastSessionStartAt = now;
    state.streak.graceEndsAt = null;

    // Log Session Start in Ledger
    state.ledger.push({
      id: 'led_start_' + now,
      timestamp: now,
      deltaEcho: 0,
      reason: 'session_start',
      sessionId: sessionId,
      hash: btoa('start' + sessionId + now)
    });

    await this.saveState(state);
    return state;
  }

  static async activateAdBoost(): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    const existingAdBoost = state.activeBoosts.find(b => b.type === 'AD' && b.expiresAt > now);
    let startAt = now;
    if (existingAdBoost) {
      if (existingAdBoost.expiresAt - now >= AD_BOOST_MAX_QUEUE_MS) throw new Error("Queue full");
      startAt = existingAdBoost.expiresAt;
    }
    const newBoost: ActiveBoost = {
      id: 'boost_ad_' + now,
      type: 'AD',
      multiplier: AD_BOOST_MULTIPLIER,
      startAt: startAt,
      expiresAt: startAt + AD_BOOST_DURATION_MS
    };
    if (existingAdBoost) existingAdBoost.expiresAt += AD_BOOST_DURATION_MS;
    else state.activeBoosts.push(newBoost);

    // Log Boost Activation in Ledger
    state.ledger.push({
      id: 'led_boost_' + now,
      timestamp: now,
      deltaEcho: 0,
      reason: 'boost_activation',
      hash: btoa('boost' + now)
    });

    this.recalculateSessionRate(state, now);
    await this.saveState(state);
    return state;
  }

  static async updatePFP(pfpUrl: string): Promise<AppState> {
    const state = await this.getState();
    state.user.pfpUrl = pfpUrl;
    await this.saveState(state);
    return state;
  }

  static async createStripeSession(itemId: string): Promise<string> {
    const state = await this.getState();
    const item = STORE_ITEMS.find(i => i.id === itemId);
    if (!item) throw new Error("Item not found");
    const sessionId = 'cs_test_' + Math.random().toString(36).substring(7);
    state.purchaseHistory.push({ id: sessionId, itemId: itemId, timestamp: Date.now(), amount: item.price, status: 'pending' });
    await this.saveState(state);
    return sessionId;
  }

  static async handleStripeWebhook(sessionId: string): Promise<AppState> {
    const state = await this.getState();
    const now = Date.now();
    const historyEntry = state.purchaseHistory.find(h => h.id === sessionId);
    if (!historyEntry || historyEntry.status === 'paid') return state;
    const item = STORE_ITEMS.find(i => i.id === historyEntry.itemId);
    if (!item) return state;
    
    historyEntry.status = 'paid';
    if (item.echoAmount) {
      state.user.balance += item.echoAmount;
      state.ledger.push({
        id: 'led_purchase_' + now,
        timestamp: now,
        deltaEcho: item.echoAmount,
        reason: 'purchase_topup',
        hash: btoa(item.id + now)
      });
    }

    if (item.id === 'resonance_echo') state.user.priorityAirdrop = true;
    if (item.multiplier && item.multiplier > 1) {
      state.activeBoosts.push({
        id: 'boost_store_' + item.id + '_' + now,
        type: 'STORE',
        multiplier: item.multiplier,
        startAt: now,
        expiresAt: item.durationDays ? now + (item.durationDays * 86400000) : now + 3153600000000,
        sourceRef: item.id
      });
    }
    this.recalculateSessionRate(state, now);
    await this.saveState(state);
    return state;
  }

  private static recalculateSessionRate(state: AppState, now: number) {
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
      
      state.ledger.push({
        id: 'led_settle_' + now,
        timestamp: now,
        deltaEcho: earnings,
        reason: 'session_settlement',
        sessionId: state.session.id,
        hash: btoa(state.session.id + earnings + now)
      });

      // Log referral portion if applicable
      if (state.user.referrals > 0) {
         const referralPortion = earnings * ( (state.user.referrals * 0.25) / (1 + (state.user.referrals * 0.25)) );
         state.ledger.push({
           id: 'led_ref_' + now,
           timestamp: now,
           deltaEcho: referralPortion,
           reason: 'referral_bonus',
           hash: btoa('ref' + now)
         });
      }

      state.streak.lastSessionEndAt = state.session.endTime;
      state.streak.graceEndsAt = state.session.endTime + STREAK_GRACE_PERIOD_MS;
      state.session.isActive = false;
      state.session.status = 'settled';
      await this.saveState(state);
    }
    return state;
  }

  static async getNonce(): Promise<string> {
    const state = await this.getState();
    const nonce = Math.random().toString(36).substring(2, 15);
    state.currentNonce = nonce;
    await this.saveState(state);
    return nonce;
  }

  static async verifyWallet(address: string, signature: string): Promise<AppState> {
    const state = await this.getState();
    if (!state.currentNonce || !signature.startsWith('sig_')) throw new Error("Verification failed.");
    state.walletAddress = address;
    state.walletVerifiedAt = Date.now();
    state.currentNonce = null;
    await this.saveState(state);
    return state;
  }

  static async getSnapshotCSV(): Promise<string> {
    const state = await this.getState();
    const headers = "WalletAddress,EchoBalance,VerifiedAt,RiskScore,IsAdmin,PriorityAirdrop\n";
    const row = `${state.walletAddress || 'N/A'},${state.user.balance.toFixed(4)},${state.walletVerifiedAt ? new Date(state.walletVerifiedAt).toISOString() : 'N/A'},${state.user.riskScore},${state.user.isAdmin ? 'TRUE' : 'FALSE'},${state.user.priorityAirdrop ? 'TRUE' : 'FALSE'}\n`;
    return headers + row;
  }
}
