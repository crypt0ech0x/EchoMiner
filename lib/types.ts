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

// ✅ Keep your legacy session shape so MineTab/ProfileDrawer keep compiling,
// but ADD the server-driven fields we need for DB mining display.
export interface MiningSession {
  id: string;

  isActive: boolean;

  // legacy fields (some tabs use these)
  startTime: number | null;
  endTime: number | null;
  baseRate: number; // “base rate” used by old UI
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;
  effectiveRate: number; // per-second in your UI (MineTab uses effectiveRate * 3600 in places)
  status: "active" | "ended" | "settled";

  // ✅ NEW server-driven fields (from DB-backed mining)
  startedAt?: string | null;
  lastAccruedAt?: string | null;
  baseRatePerHr?: number;
  multiplier?: number;
  sessionMined?: number; // the big one: DB session counter
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

// ✅ Add these so your app stops “guessing”
export interface WalletState {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null;
}

// ✅ AppState becomes the single UI state object.
export interface AppState {
  // ✅ new top-level auth state
  authed: boolean;
  wallet: WalletState;

  // existing app state your UI expects
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;
  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // legacy wallet fields some components still reference
  walletAddress: string | null;
  walletVerifiedAt: number | null;
  currentNonce: string | null;
}