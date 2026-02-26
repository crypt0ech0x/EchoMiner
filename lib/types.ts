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
  balance: number;

  // IMPORTANT: your UI uses totalMined
  totalMined: number;

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

/**
 * UI MiningSession (what your MineTab likely expects)
 * Keep this stable to avoid rewriting the whole UI.
 */
export interface MiningSession {
  id: string;
  isActive: boolean;

  startTime: number | null;
  endTime: number | null;

  baseRate: number;

  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;

  effectiveRate: number;

  status: "active" | "ended" | "settled";

  // Add this so you can display mined so far if you want
  sessionMined?: number;
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

export interface AppState {
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;
  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // Your existing wallet fields (UI legacy)
  walletAddress: string | null;
  walletVerifiedAt: number | null;

  // Some older flows used nonce in the client
  currentNonce: string | null;
}

/* ------------------------------------------------------------------ */
/* NEW: API response types (matches your DB-backed /api/state output)  */
/* ------------------------------------------------------------------ */

export type ApiWallet = {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null; // ISO
};

export type ApiUser = {
  totalMinedEcho: number;
};

export type ApiMiningSession = {
  isActive: boolean;
  startedAt: string | null;      // ISO
  lastAccruedAt: string | null;  // ISO
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
};