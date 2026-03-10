// server.ts
import {
  AppState,
  ActiveBoost,
  StoreItem,
  PurchaseHistoryEntry,
  AppNotification,
  NotificationType,
  NotificationPreferences,
  LedgerEntry,
} from "@/lib/types";

const now = () => Date.now();

function createNotificationPreferences(): NotificationPreferences {
  return {
    session_end: true,
    streak_grace_warning: true,
    boost_expired: true,
    weekly_summary: true,
    airdrop_announcement: true,
  };
}

function createNotification(
  type: NotificationType,
  title: string,
  body: string
): AppNotification {
  return {
    id: `notif_${Math.random().toString(36).slice(2, 11)}`,
    type,
    title,
    body,
    createdAt: now(),
    readAt: null,
  };
}

function createLedgerEntry(
  reason: LedgerEntry["reason"],
  deltaEcho: number
): LedgerEntry {
  return {
    id: `ledger_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: now(),
    deltaEcho,
    reason,
    hash: Math.random().toString(36).slice(2, 14),
  };
}

function createPurchaseHistoryEntry(
  itemId: string,
  itemName: string,
  amountEcho: number,
  pricePaid = 0,
  currency = "SOL"
): PurchaseHistoryEntry {
  return {
    id: `purchase_${Math.random().toString(36).slice(2, 11)}`,
    itemId,
    itemName,
    amountEcho,
    pricePaid,
    currency,
    createdAt: now(),
    source: "store",
    metadataJson: null,
  };
}

export function createDefaultState(username = "Voyager"): AppState {
  const refCode = `ECHO${Math.floor(1000 + Math.random() * 9000)}`;

  return {
    authed: false,
    wallet: {
      address: null,
      verified: false,
      verifiedAt: null,
    },

    user: {
      id: `user_${Math.random().toString(36).slice(2, 11)}`,
      username,
      balance: 0,
      totalMined: 0,
      totalPurchased: 0,
      purchaseMultiplier: 1,
      referralMultiplier: 1,
      referrals: 0,
      joinedDate: now(),
      guest: true,
      riskScore: 0,
      referralCode: refCode,
      isAdmin: false,
      priorityAirdrop: false,
      notificationPreferences: createNotificationPreferences(),
    },

    streak: {
      currentStreak: 0,
      lastSessionStartAt: null,
      lastSessionEndAt: null,
      graceEndsAt: null,
      nextMultiplier: 1,
    },

    session: {
      id: "",
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

export function createMockState(overrides?: Partial<AppState>): AppState {
  const base = createDefaultState();

  return {
    ...base,
    ...overrides,
    wallet: {
      ...base.wallet,
      ...(overrides?.wallet ?? {}),
    },
    user: {
      ...base.user,
      ...(overrides?.user ?? {}),
    },
    streak: {
      ...base.streak,
      ...(overrides?.streak ?? {}),
    },
    session: {
      ...base.session,
      ...(overrides?.session ?? {}),
    },
    activeBoosts: overrides?.activeBoosts ?? base.activeBoosts,
    ledger: overrides?.ledger ?? base.ledger,
    purchaseHistory: overrides?.purchaseHistory ?? base.purchaseHistory,
    notifications: overrides?.notifications ?? base.notifications,
  };
}

export function createDemoState(): AppState {
  const current = now();
  const oneHour = 60 * 60 * 1000;
  const twentyFourHours = 24 * oneHour;

  const activeBoosts: ActiveBoost[] = [
    {
      id: "boost_demo_ad",
      type: "AD",
      multiplier: 2,
      startAt: current - 15 * 60 * 1000,
      expiresAt: current + 45 * 60 * 1000,
      sourceRef: "demo",
    },
  ];

  const notifications: AppNotification[] = [
    createNotification(
      "weekly_summary",
      "Welcome to Echo Miner",
      "Your account is ready. Start a mining session to begin accumulating ECHO."
    ),
    createNotification(
      "airdrop_announcement",
      "Mainnet Prep Active",
      "Verify your wallet and keep your streak alive for airdrop readiness."
    ),
  ];

  const ledger: LedgerEntry[] = [
    createLedgerEntry("purchase_topup", 100),
    createLedgerEntry("session_settlement", 12.5),
  ];

  const purchaseHistory: PurchaseHistoryEntry[] = [
    createPurchaseHistoryEntry("starter", "Starter Pack", 100, 0.1, "SOL"),
  ];

  return {
    authed: true,
    wallet: {
      address: "DemoWallet1111111111111111111111111111111",
      verified: true,
      verifiedAt: new Date(current - oneHour).toISOString(),
    },

    user: {
      id: "user_demo",
      username: "Echo Voyager",
      balance: 112.5,
      totalMined: 12.5,
      totalPurchased: 100,
      purchaseMultiplier: 1.1,
      referralMultiplier: 1,
      referrals: 0,
      joinedDate: current - 7 * twentyFourHours,
      guest: false,
      riskScore: 0,
      referralCode: "ECHO4321",
      isAdmin: false,
      priorityAirdrop: false,
      notificationPreferences: createNotificationPreferences(),
    },

    streak: {
      currentStreak: 2,
      lastSessionStartAt: current - 2 * oneHour,
      lastSessionEndAt: current + 22 * oneHour,
      graceEndsAt: current + 46 * oneHour,
      nextMultiplier: 3,
    },

    session: {
      id: "sess_demo",
      isActive: true,
      startTime: current - 2 * oneHour,
      endTime: current + 22 * oneHour,
      baseRate: 1 / 24 / 3600,
      streakMultiplier: 2,
      boostMultiplier: 2,
      purchaseMultiplier: 1.1,
      effectiveRate: ((1 / 24) * 2.2) / 3600,
      status: "active",
      sessionMined: 0.183333,
      lastAccruedAt: current - 60 * 1000,
      baseRatePerHr: 1 / 24,
      multiplier: 2.2,
    },

    activeBoosts,
    ledger,
    purchaseHistory,
    notifications,

    walletAddress: "DemoWallet1111111111111111111111111111111",
    walletVerifiedAt: current - oneHour,
    currentNonce: null,
  };
}

export function getStoreCatalog(): StoreItem[] {
  return [
    {
      id: "starter",
      name: "Starter Pack",
      description: "Get your first ECHO boost with a small SOL purchase.",
      price: 0.1,
      echoAmount: 100,
      badge: "Entry",
      isPopular: false,
    },
    {
      id: "pro",
      name: "Pro Pack",
      description: "Best early value for building your ECHO balance faster.",
      price: 0.5,
      echoAmount: 600,
      badge: "Popular",
      isPopular: true,
    },
    {
      id: "whale",
      name: "Whale Pack",
      description: "Largest pack for users who want maximum acceleration.",
      price: 1,
      echoAmount: 1400,
      badge: "Best Value",
      isPopular: false,
    },
  ];
}

const ServerMock = {
  createDefaultState,
  createMockState,
  createDemoState,
  getStoreCatalog,
};

export default ServerMock;