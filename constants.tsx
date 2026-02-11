
import { StoreItem } from './types';

export const BASE_MINING_RATE = 0.0001543; // ECHO per second
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const STREAK_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours grace after session ends
export const AD_BOOST_DURATION_MS = 60 * 60 * 1000;
export const AD_BOOST_MULTIPLIER = 2.0;
export const AD_BOOST_MAX_QUEUE_MS = 3 * 60 * 60 * 1000;

export const GET_STREAK_MULTIPLIER = (days: number): number => {
  // 1 day = 1x, 2 days = 2x, etc.
  // We ensure it's at least 1.0 even for new users.
  return Math.max(1, days);
};

export const STORE_ITEMS: StoreItem[] = [
  {
    id: 'starter_echo',
    name: 'Starter',
    description: 'A quick entry into the ecosystem. Grants immediate balance.',
    price: 1.00,
    echoAmount: 250,
  },
  {
    id: 'explorer_echo',
    name: 'Explorer',
    description: 'Fuel your journey with a substantial ECHO injection.',
    price: 5.00,
    echoAmount: 1500,
    isPopular: true
  },
  {
    id: 'miner_echo',
    name: 'Miner',
    description: 'Professional grade hardware top-up for serious voyagers.',
    price: 10.00,
    echoAmount: 3500,
  },
  {
    id: 'whale_echo',
    name: 'Whale',
    description: 'A massive wave of ECHO to dominate the leaderboards.',
    price: 20.00,
    echoAmount: 7500,
  },
  {
    id: 'legend_echo',
    name: 'Legend',
    description: 'Legendary status with a massive balance and VIP distinction.',
    price: 50.00,
    echoAmount: 25000,
    badge: 'VIP'
  },
  {
    id: 'resonance_echo',
    name: 'Resonance',
    description: 'Absolute power. Massive ECHO, VIP badge, and Priority Airdrop status.',
    price: 250.00,
    echoAmount: 150000,
    badge: 'VIP'
  }
];

export const TOKENS = {
  colors: {
    navy: '#020617',
    purple: '#8B5CF6',
    violet: '#C084FC',
    teal: '#2DD4BF',
    slate: '#94A3B8',
    surface: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.08)'
  }
};
