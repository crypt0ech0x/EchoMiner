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

export interface MiningSession {
  id: string;
  isActive: boolean;

  // UI fields
  startTime: number | null; // ms
  endTime: number | null;   // ms
  baseRate: number;         // per second
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;
  effectiveRate: number;    // per second
  status: "active" | "ended" | "settled";

  // Server-backed extras (so MineTab can show real mined)
  sessionMined?: number;    // total earned during this session (server truth)
  startedAt?: string | null;
  lastAccruedAt?: string | null;
  baseRatePerHr?: number;
  multiplier?: number;
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

export type WalletInfo = {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null; // ISO string or null
};

export interface AppState {
  // NEW (matches server truth)
  authed: boolean;
  wallet: WalletInfo;

  // existing UI shape
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;
  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // legacy fields used by some UI bits (keep them so you don’t crash)
  walletAddress: string | null;
  walletVerifiedAt: number | null; // ms
  currentNonce: string | null;
}