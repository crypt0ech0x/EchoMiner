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

  /**
   * IMPORTANT:
   * In your current UI, MineTab displays state.user.balance.
   * We will map DB totalMinedEcho -> this "balance" in api.ts.
   */
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

export interface MiningSession {
  id: string;
  isActive: boolean;

  // UI fields (your MineTab uses these)
  startTime: number | null;
  endTime: number | null;

  baseRate: number;
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;

  // effectiveRate is used by MineTab for E/H and E/s
  effectiveRate: number;

  status: "active" | "ended" | "settled";

  /**
   * NEW:
   * server-truth amount mined in the current session (from DB),
   * used to display earnings instead of local math.
   */
  sessionMined: number;
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
 * NEW: what server returns (or what we keep in AppState after mapping)
 */
export interface WalletInfo {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null;
}

export interface AppState {
  // NEW (server-auth truth)
  authed: boolean;
  wallet: WalletInfo;

  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;

  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // Back-compat (some older code may still reference these)
  walletAddress: string | null;
  walletVerifiedAt: number | null;
  currentNonce: string | null;
}