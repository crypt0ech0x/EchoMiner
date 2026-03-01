// app/api/start-mining/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress,
        },
      });
    }

    // Find or create/update session
    let session = await prisma.miningSession.findUnique({
      where: { userId: user.id },
    });

    const now = new Date();

    if (!session) {
      session = await prisma.miningSession.create({
        data: {
          userId: user.id,
          baseRatePerHr: 10.0,          // Default per-wallet rate (customize later)
          multiplier: 1.0,
          startedAt: now,
          lastAccruedAt: now,
          isActive: true,
          sessionMined: 0,
        },
      });
    } else if (!session.isActive) {
      session = await prisma.miningSession.update({
        where: { id: session.id },
        data: {
          isActive: true,
          startedAt: now,
          lastAccruedAt: now,
          // Keep existing baseRatePerHr (it's per-wallet)
        },
      });
    }

    return NextResponse.json({
      success: true,
      session: {
        isActive: session.isActive,
        baseRatePerHr: session.baseRatePerHr,
        multiplier: session.multiplier,
        effectiveRatePerSecond: (session.baseRatePerHr * session.multiplier) / 3600,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}