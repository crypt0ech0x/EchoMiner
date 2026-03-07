// lib/api.ts
import { AppState, WalletState, NotificationPreferences } from "./types";

type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: string | null;
  };
  user: {
    totalMinedEcho: number;
  };
  session: {
    isActive: boolean;
    startedAt: string | null;
    lastAccruedAt: string | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
  };
};

const STORAGE_KEY = "echo_miner_state_v1";
const CONNECTED_WALLET_KEY = "connected_wallet_address";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function defaultAppState(): AppState {
  const now = Date.now();

  return {
    authed: false,
    wallet: { address: null, verified: false, verifiedAt: null },

    user: {
      id: "guest",
      username: "Voyager",
      balance: 0,
      totalMined: 0,
      referrals: 0,
      joinedDate: now,
      guest: true,
      riskScore: 0,
      referralCode: "VOYAGER",
      notificationPreferences: {
        session_end: true,
        streak_grace_warning: true,
        boost_expired: true,
        weekly_summary: true,
        airdrop_announcement: true,
      },
    },

    streak: {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
    },

    session: {
      id: "sess",
      isActive: false,
      startTime: null,
      endTime: null,
      baseRate: 0,
      streakMultiplier: 1,
      boostMultiplier: 1,
      purchaseMultiplier: 1,
      effectiveRate: 0,
      status: "ended",
      sessionMined: 0,
      lastAccruedAt: null,
      baseRatePerHr: 0,
      multiplier: 1,
    },

    activeBoosts: [],
    ledger: [],
    purchaseHistory: [],
    notifications: [],

    walletAddress: null,
    walletVerifiedAt: null,
    currentNonce: null,
  };
}

function apiToAppState(api: ApiState, prev?: AppState | null): AppState {
  const incomingWalletAddr = api.wallet?.address ?? null;

  const shouldReset =
    !!prev &&
    !!incomingWalletAddr &&
    !!prev.walletAddress &&
    incomingWalletAddr !== prev.walletAddress;

  const base = shouldReset ? defaultAppState() :