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
  balance: number; // used by MineTab for display
  totalMined: number; // keep for existing UI
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
 * UI MiningSession shape (what MineTab expects)
 * We ALSO keep DB timestamps for smoother earnings display.
 */
export interface MiningSession {
  id: string;
  isActive: boolean;

  // UI timers (ms)
  startTime: number | null;
  endTime: number | null;

  // Rates (per-second for effectiveRate)
  baseRate: number; // per-second base rate
  streakMultiplier: number;
  boostMultiplier: number;
  purchaseMultiplier: number;
  effectiveRate: number; // per-second

  status: "active" | "ended" | "settled";

  // --- NEW: server-truth fields (from DB) ---
  sessionMined: number; // accrued amount this session
  startedAt?: string | null; // ISO
  lastAccruedAt?: string | null; // ISO

  // optional to help debugging
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

export type WalletState = {
  address: string | null;
  verified: boolean;
  verifiedAt: string | null;
};

export interface AppState {
  // --- NEW: returned by server (/api/state) ---
  ok: boolean;
  authed: boolean;
  wallet: WalletState;

  // --- existing UI state ---
  user: UserStats;
  streak: StreakInfo;
  session: MiningSession;

  activeBoosts: ActiveBoost[];
  ledger: LedgerEntry[];
  purchaseHistory: any[];
  notifications: AppNotification[];

  // legacy wallet fields your components still reference (keep them)
  walletAddress: string | null;
  walletVerifiedAt: number | null;
  currentNonce: string | null;
}