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
  createdAt: number; // ms
  readAt: number | null; // ms
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

  // UI balance display fields
  balance: number;         // mined + purchased
  totalMined: number;      // mirrors server totalMinedEcho
  totalPurchased: number;  // mirrors server totalPurchasedEcho

  referrals: number;
  joinedDate: number; // ms
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
  nextMultiplier: number;
}

export interface WalletState {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null; // ISO string
}

/**
 * MiningSession contract
 *
 * Legacy UI expects:
 * - startTime/endTime in ms
 * - effectiveRate is PER-SECOND (MineTab uses effectiveRate * 3600 to display E/H)
 *
 * Server-backed truth:
 * - sessionMined (float)
 * - lastAccruedAt (ms)
 * - baseRatePerHr & multiplier (exact server values)
 */
export interface MiningSession {
  id: string;
  isActive: boolean;

  // ----- legacy UI fields -----
  startTime: number | null; // ms
  endTime: number | null;   // ms
  baseRate: number;         // derived from baseRatePerHr / 3600
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;

  /**
   * IMPORTANT: PER-SECOND rate.
   * MineTab displays E/H via (effectiveRate * 3600).
   */
  effectiveRate: number;

  status: "active" | "ended" | "settled";

  // ----- server truth fields -----
  sessionMined: number;
  lastAccruedAt: number | null; // ms timestamp

  baseRatePerHr: number;
  multiplier: number;
}

export interface ActiveBoost {
  id: string;
  type: "AD" | "STORE";
  multiplier: number;
  startAt: number;   // ms
  expiresAt: number; // ms
  sourceRef?: string;
}

export interface LedgerEntry {
  id: string;
  timestamp: number; // ms
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
  // ---- server contract ----
  authed: boolean;
  wallet: WalletState;

  // ---- UI contract ----
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;

  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  /**
   * Legacy wallet fields.
   * These should ALWAYS mirror `wallet` so old UI code doesn’t explode.
   * You can delete these after you finish refactors.
   */
  walletAddress: string | null;
  walletVerifiedAt: number | null; // ms
  currentNonce: string | null;
}