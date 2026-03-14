// app/api/boost/activate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  settleMiningSession,
  reprojectMiningSession,
} from "@/lib/mining";
import { getEffectiveMultiplier } from "@/lib/economy";

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

    // Refresh session first so we work from current canonical session data
    const settled = await settleMiningSession(user.id);

    if (!settled.isActive) {
      return NextResponse.json(
        { ok: false, error: "No active mining session" },
        { status: 409 }
      );
    }

    const userRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        purchaseMultiplier: true,
        referralMultiplier: true,
      },
    });

    const streakMultiplier = Number(settled.currentMultiplier ?? 1);
    const purchaseMultiplier = Number(userRow?.purchaseMultiplier ?? 1);
    const referralMultiplier = Number(userRow?.referralMultiplier ?? 1);

    // For now we keep leaderboard at 1 until fully re-enabled.
    const leaderboardMultiplier = 1;

    // Apply ad boost as a live 2x factor on top of the current session stack
    const boostMultiplier = AD_BOOST_MULTIPLIER;

    const newMultiplier = getEffectiveMultiplier({
      streakMultiplier,
      purchaseMultiplier,
      referralMultiplier,
      leaderboardMultiplier,
      boostMultiplier,
    });

    const reprojection = await reprojectMiningSession({
      userId: user.id,
      newMultiplier,
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
          boostMultiplier,
          appliedMultiplier: newMultiplier,
          previousSessionMined: Number(settled.sessionMined ?? 0),
          projectedTotalEcho: Number(reprojection.projectedTotalEcho ?? 0),
          activatedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      applied: true,
      currentMultiplier: Number(reprojection.currentMultiplier ?? newMultiplier),
      currentRatePerSec: Number(reprojection.currentRatePerSec ?? 0),
      projectedTotalEcho: Number(reprojection.projectedTotalEcho ?? 0),
      sessionMined: Number(reprojection.liveEarnedEcho ?? reprojection.sessionMined ?? 0),
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