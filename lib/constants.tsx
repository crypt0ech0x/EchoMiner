import { StoreItem } from '@/lib/types';

export const BASE_MINING_RATE = 0.0001543; // ECHO per second
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const STREAK_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
export const AD_BOOST_DURATION_MS = 60 * 60 * 1000;
export const AD_BOOST_MULTIPLIER = 2;
export const AD_BOOST_MAX_QUEUE_MS = 4 * 60 * 60 * 1000;

export const GET_STREAK_MULTIPLIER = (streak: number): number => {
  if (streak <= 1) return 1;
  return streak;
};

export const STORE_ITEMS: StoreItem[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    description: 'Get your first ECHO boost with a small SOL purchase.',
    price: 0.1,
    echoAmount: 100,
    badge: 'Entry',
    isPopular: false,
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    description: 'Best early value for building your ECHO balance faster.',
    price: 0.5,
    echoAmount: 600,
    badge: 'Popular',
    isPopular: true,
  },
  {
    id: 'whale',
    name: 'Whale Pack',
    description: 'Largest pack for users who want maximum acceleration.',
    price: 1,
    echoAmount: 1400,
    badge: 'Best Value',
    isPopular: false,
  },
];