// lib/types.ts

export enum Tab {
  MINE = "mine",
  BOOST = "boost",
  STORE = "store",
  WALLET = "wallet",
}

export type NotificationType =
  | "session_end"
  | "streak_grace_warning"
  | "boost_expired"
  | "weekly_summary"
  | "airdrop_announcement";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  actionUrl?: string;
}

export interface NotificationPreferences {
  session_end: boolean;
  streak_grace_warning: boolean;
  boost_expired: boolean;
  weekly_summary: boolean;
  airdrop_announcement: boolean;
}

export interface UserStats {
  id: string;
  username: string;
  balance: number; // UI balance (we'll map totalMinedEcho here)
  totalMined: number; // also map totalMinedEcho here for existing UI usage
  referrals: number;
  joinedDate: number;
  guest: boolean;
  riskScore: number;
  referralCode: string;
  isAdmin?: boolean;
  priorityAirdrop?: boolean;
  pfpUrl?: string;
  email?: string;
  emailVerified?: boolean;
  notificationPreferences: NotificationPreferences;
}

export interface StreakInfo {
  currentStreak: number;
  lastSessionStartAt: number | null;
  lastSessionEndAt: number | null;
  graceEndsAt: number | null;
}

export interface MiningSession {
  id: string;
  isActive: boolean;

  // UI expects these:
  startTime: number | null; // ms
  endTime: number | null; // ms

  // UI expects these multipliers/rates:
  baseRate: number; // E/sec (UI naming)
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;
  effectiveRate: number; // E/sec

  status: "active" | "ended" | "settled";

  // ✅ NEW: server-backed truth so MineTab can show real mined amount
  sessionMined: number; // ECHO earned this session (server truth)
  lastAccruedAt: number | null; // ms (server truth)
}

export interface ActiveBoost {
  id: string;
  type: "AD" | "STORE";
  multiplier: number;
  startAt: number;
  expiresAt: number;
  sourceRef?: string;
}

export interface LedgerEntry {
  id: string;
  timestamp: number;
  deltaEcho: number;
  reason:
    | "session_settlement"
    | "referral_bonus"
    | "admin_adjustment"
    | "purchase_topup"
    | "session_start"
    | "boost_activation";
  sessionId?: string;
  hash: string;
}

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  price: number;
  multiplier?: number;
  echoAmount?: number;
  durationDays?: number;
  badge?: string;
  isPopular?: boolean;
}

/**
 * ✅ Server API response types (what your /api/state is actually returning now)
 */
export type ApiWallet = {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null; // ISO string or null
};

export type ApiUser = {
  totalMinedEcho: number;
};

export type ApiMiningSession = {
  isActive: boolean;
  startedAt: string | null; // ISO
  lastAccruedAt: string | null; // ISO
  baseRatePerHr: number;
  multiplier: number;
  sessionMined: number;
};

export type ApiState = {
  ok: boolean;
  authed: boolean;
  wallet: ApiWallet;
  user: ApiUser;
  session: ApiMiningSession;
  endsAt?: string | null; // some routes return this
  earned?: number; // refresh returns earned
};

/**
 * ✅ AppState used by UI components
 * We keep your existing fields, but add `authed` + `wallet` for server truth.
 */
export interface AppState {
  // ✅ server auth info
  authed: boolean;

  // ✅ server wallet info
  wallet: ApiWallet;

  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;

  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // kept for backward compatibility with older code:
  walletAddress: string | null;
  walletVerifiedAt: number | null; // ms
  currentNonce: string | null;
}