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

// ✅ Updated: includes optional server-backed fields
export interface MiningSession {
  id: string;
  isActive: boolean;

  // legacy UI fields (your MineTab uses these)
  startTime: number | null;
  endTime: number | null;
  baseRate: number;
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;
  effectiveRate: number; // per-second in your UI math
  status: "active" | "ended" | "settled";

  // ✅ NEW server-backed fields
  sessionMined: number; // server truth for current session mined
  lastAccruedAt: number | null; // ms timestamp of last accrual
  baseRatePerHr?: number; // from DB session
  multiplier?: number; // from DB session
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

// ✅ New wallet object (what /api/state returns)
export interface WalletState {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null;
}

// ✅ AppState now includes server fields, but keeps your old ones too
export interface AppState {
  // server auth + wallet (your build errors were because these were missing)
  authed: boolean;
  wallet: WalletState;

  // existing app fields your UI expects
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;
  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // legacy wallet fields (kept so old UI code doesn’t explode)
  walletAddress: string | null;
  walletVerifiedAt: number | null;
  currentNonce: string | null;
}