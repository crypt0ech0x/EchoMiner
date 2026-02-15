
import { NextRequest, NextResponse } from 'next/server';
import { BASE_MINING_RATE } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const { state } = await req.json();

  if (!state) {
    const now = Date.now();
    const refCode = 'ECHO' + Math.floor(1000 + Math.random() * 9000);
    const newState = {
      user: {
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        username: refCode,
        balance: 0,
        totalMined: 0,
        referrals: 0,
        joinedDate: now,
        guest: true,
        riskScore: 0,
        referralCode: refCode,
        isAdmin: false,
        priorityAirdrop: false,
        notificationPreferences: {
          session_end: true,
          streak_grace_warning: true,
          boost_expired: true,
          weekly_summary: true,
          airdrop_announcement: true
        }
      },
      streak: { currentStreak: 0, lastSessionStartAt: null, lastSessionEndAt: null, graceEndsAt: null },
      session: {
        id: '', isActive: false, startTime: null, endTime: null, baseRate: BASE_MINING_RATE,
        streakMultiplier: 1, boostMultiplier: 1, purchaseMultiplier: 1, effectiveRate: 0, status: 'ended'
      },
      activeBoosts: [], ledger: [], purchaseHistory: [], notifications: [],
      walletAddress: null, walletVerifiedAt: null, currentNonce: null
    };
    return NextResponse.json(newState);
  }

  return NextResponse.json(state);
}
