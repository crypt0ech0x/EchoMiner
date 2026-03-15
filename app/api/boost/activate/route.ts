import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  AD_BOOST_DURATION_SECONDS,
  reprojectMiningSession,
  settleMiningSession,
} from "@/lib/mining";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AD_BOOST_MULTIPLIER = 2;

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settled = await settleMiningSession(user.id);

    if (!settled.isActive || !settled.startedAt || !settled.endsAt) {
      return NextResponse.json(
        { ok: false, error: "No active mining session" },
        { status: 409 }
      );
    }

    const now = new Date();

    const currentSession = await prisma.miningSession.findUnique({
      where: { userId: user.id },
    });

    if (!currentSession || !currentSession.isActive || !currentSession.endsAt) {
      return NextResponse.json(
        { ok: false, error: "No active mining session" },
        { status: 409 }
      );
    }

    const baseSessionMultiplier = Number(
      currentSession.baseSessionMultiplier ?? settled.baseSessionMultiplier ?? 1
    );

    const nextBoostExpiresAt =
      currentSession.boostExpiresAt &&
      currentSession.boostExpiresAt.getTime() > now.getTime()
        ? new Date(
            currentSession.boostExpiresAt.getTime() +
              AD_BOOST_DURATION_SECONDS * 1000
          )
        : new Date(now.getTime() + AD_BOOST_DURATION_SECONDS * 1000);

    const reprojection = await reprojectMiningSession({
      userId: user.id,
      baseSessionMultiplier,
      boostMultiplier: AD_BOOST_MULTIPLIER,
      boostExpiresAt: nextBoostExpiresAt,
      now,
    });

    if (!reprojection) {
      return NextResponse.json(
        { ok: false, error: "No active mining session" },
        { status: 409 }
      );
    }

    await prisma.ledgerEntry.create({
      data: {
        userId: user.id,
        type: "boost_activation",
        amountEcho: 0,
        sourceType: "ad_boost",
        sourceId: reprojection.id,
        metadataJson: {
          boostMultiplier: AD_BOOST_MULTIPLIER,
          baseSessionMultiplier,
          appliedMultiplier: Number(reprojection.currentMultiplier ?? 1),
          projectedTotalEcho: Number(reprojection.projectedTotalEcho ?? 0),
          activatedAt: now.toISOString(),
          boostExpiresAt: nextBoostExpiresAt.toISOString(),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      applied: true,
      baseSessionMultiplier: Number(reprojection.baseSessionMultiplier ?? baseSessionMultiplier),
      boostMultiplier: Number(reprojection.boostMultiplier ?? AD_BOOST_MULTIPLIER),
      boostExpiresAt: reprojection.boostExpiresAt
        ? reprojection.boostExpiresAt.toISOString()
        : nextBoostExpiresAt.toISOString(),
      currentMultiplier: Number(reprojection.currentMultiplier ?? 1),
      currentRatePerSec: Number(reprojection.currentRatePerSec ?? 0),
      projectedTotalEcho: Number(reprojection.projectedTotalEcho ?? 0),
      sessionMined: Number(
        reprojection.liveEarnedEcho ?? reprojection.sessionMined ?? 0
      ),
      startedAt: reprojection.startedAt?.toISOString() ?? null,
      endsAt: reprojection.endsAt?.toISOString() ?? null,
      lastRateChangeAt: reprojection.lastRateChangeAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    console.error("boost/activate error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Boost activation failed" },
      { status: 500 }
    );
  }
}