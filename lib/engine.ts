
import { 
  AppState, 
  NotificationType, 
  ActiveBoost, 
  AppNotification 
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

export class EchoEngine {
  
  static recalculateRate(state: AppState, now: number) {
    if (!state.session.isActive) return;
    const refMult = 1 + (state.user.referrals * 0.25);
    const adMult = state.activeBoosts
      .filter(b => b.type === 'AD' && b.expiresAt > now)
      .reduce((acc, b) => acc * b.multiplier, 1.0);
    const storeMult = state.activeBoosts
      .filter(b => b.type === 'STORE' && b.expiresAt > now)
      .reduce((acc, b) => acc * b.multiplier, 1.0);
    
    state.session.boostMultiplier = adMult * refMult;
    state.session.purchaseMultiplier = storeMult;
    state.session.effectiveRate = state.session.baseRate * state.session.streakMultiplier * adMult * refMult * storeMult;
  }

  static processMaintenance(state: AppState, now: number): boolean {
    let changed = false;

    // 1. Filter out expired boosts
    const initialBoostCount = state.activeBoosts.length;
    state.activeBoosts = state.activeBoosts.filter(b => b.expiresAt > now);
    if (state.activeBoosts.length !== initialBoostCount) {
      changed = true;
      if (state.session.isActive) this.recalculateRate(state, now);
    }

    // 2. Settle sessions
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
        hash: btoa(state.session.id + earnings) 
      });
      state.streak.lastSessionEndAt = state.session.endTime;
      state.streak.graceEndsAt = state.session.endTime + STREAK_GRACE_PERIOD_MS;
      state.session.isActive = false;
      state.session.status = 'settled';
      
      state.notifications.unshift({
        id: 'notif_settle_' + now,
        type: 'session_end',
        title: 'Mining Complete',
        body: `Your cycle ended. Earned +${earnings.toFixed(4)} ECHO.`,
        createdAt: now,
        readAt: null
      });

      changed = true;
    }

    return changed;
  }

  static startSession(state: AppState, now: number): AppState {
    if (state.session.isActive) throw new Error("Session already active");

    let newStreak = state.streak.currentStreak;
    if (state.streak.graceEndsAt && now > state.streak.graceEndsAt) newStreak = 1;
    else newStreak += 1;

    const streakMult = GET_STREAK_MULTIPLIER(newStreak);
    const sessionId = 'sess_' + now;
    
    state.session = {
      id: sessionId, isActive: true, startTime: now, endTime: now + SESSION_DURATION_MS,
      baseRate: BASE_MINING_RATE, streakMultiplier: streakMult, boostMultiplier: 1,
      purchaseMultiplier: 1, effectiveRate: 0, status: 'active'
    };
    
    this.recalculateRate(state, now);
    
    state.streak.currentStreak = newStreak;
    state.streak.lastSessionStartAt = now;
    state.streak.graceEndsAt = null;

    state.ledger.push({ id: 'led_start_' + now, timestamp: now, deltaEcho: 0, reason: 'session_start', sessionId, hash: btoa('start' + sessionId + now) });
    return state;
  }

  static addAdBoost(state: AppState, now: number): AppState {
    const existing = state.activeBoosts.find(b => b.type === 'AD' && b.expiresAt > now);
    let startAt = now;
    if (existing) {
      if (existing.expiresAt - now >= AD_BOOST_MAX_QUEUE_MS) throw new Error("Boost queue full");
      startAt = existing.expiresAt;
      existing.expiresAt += AD_BOOST_DURATION_MS;
    } else {
      state.activeBoosts.push({ 
        id: 'boost_ad_' + now, type: 'AD', multiplier: AD_BOOST_MULTIPLIER, 
        startAt, expiresAt: startAt + AD_BOOST_DURATION_MS 
      });
    }

    state.ledger.push({ id: 'led_boost_' + now, timestamp: now, deltaEcho: 0, reason: 'boost_activation', hash: btoa('boost' + now) });
    this.recalculateRate(state, now);
    return state;
  }

  static getSnapshotCSV(state: AppState): string {
    const headers = "WalletAddress,EchoBalance,VerifiedAt,RiskScore,IsAdmin,PriorityAirdrop\n";
    const row = `${state.walletAddress || 'N/A'},${state.user.balance.toFixed(4)},${state.walletVerifiedAt ? new Date(state.walletVerifiedAt).toISOString() : 'N/A'},${state.user.riskScore},${state.user.isAdmin ? 'TRUE' : 'FALSE'},${state.user.priorityAirdrop ? 'TRUE' : 'FALSE'}\n`;
    return headers + row;
  }

  static processPurchase(state: AppState, sessionId: string, now: number): AppState {
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
    this.recalculateRate(state, now);
    return state;
  }
}
