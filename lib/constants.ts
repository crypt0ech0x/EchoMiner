
import { StoreItem } from './types';

export const BASE_MINING_RATE = 0.0001543;
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const STREAK_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
export const AD_BOOST_DURATION_MS = 60 * 60 * 1000;
export const AD_BOOST_MULTIPLIER = 2.0;
export const AD_BOOST_MAX_QUEUE_MS = 3 * 60 * 60 * 1000;

export const GET_STREAK_MULTIPLIER = (days: number): number => Math.max(1, days);

export const STORE_ITEMS: StoreItem[] = [
  { id: 'starter_echo', name: 'Starter', description: 'Quick entry balance injection.', price: 1.00, echoAmount: 250 },
  { id: 'explorer_echo', name: 'Explorer', description: 'Fuel your journey.', price: 5.00, echoAmount: 1500, isPopular: true },
  { id: 'miner_echo', name: 'Miner', description: 'Serious voyager top-up.', price: 10.00, echoAmount: 3500 },
  { id: 'whale_echo', name: 'Whale', description: 'Dominate the leaderboards.', price: 20.00, echoAmount: 7500 },
  { id: 'legend_echo', name: 'Legend', description: 'Legendary status.', price: 50.00, echoAmount: 25000, badge: 'VIP' },
  { id: 'resonance_echo', name: 'Resonance', description: 'Absolute power & Priority.', price: 250.00, echoAmount: 150000, badge: 'VIP' }
];
