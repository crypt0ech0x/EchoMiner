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
 * IMPORTANT:
 * Your server truth is:
 * - startedAt (Date)
 * - lastAccruedAt (Date)
 * - baseRatePerHr (number)
 * - multiplier (number)
 * - sessionMined (number)
 *
 * Your UI expects legacy fields:
 * - startTime/endTime (ms)
 * - baseRate/effectiveRate (ECHO per second)
 */
export interface MiningSession {
  id: string;

  isActive: boolean;

  // Legacy UI fields (ms)
  startTime: number | null;
  endTime: number | null;

  // Legacy UI fields (rates are PER SECOND in the UI)
  baseRate: number;
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;
  effectiveRate: number;

  status: "active" | "ended" | "settled";

  // Server-driven extras (added)
  sessionMined?: number; // total earned this session (server truth)
  lastAccruedAt?: number | string | null; // ms or ISO string (depending on your mapper)
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

// New canonical wallet block (what /api/state returns)
export interface WalletState {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null; // ISO string or null
}

export interface AppState {
  // NEW: server state
  ok?: boolean;
  authed: boolean;
  wallet: WalletState;

  // Existing app state (keep so UI doesn't explode)
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;
  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // Keep old wallet fields for backward-compat
  walletAddress: string | null;
  walletVerifiedAt: number | null;
  currentNonce: string | null;
}