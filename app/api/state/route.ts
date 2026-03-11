// app/api/state/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import {
  settleMiningSession,
  getNextSessionPlan,
  getGraceEndsAt,
} from "@/lib/mining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shapeResponse(args: {
  authed: boolean;
  wallet: {
    address: string | null;
    verified: boolean;
    verifiedAt: Date | null;
  } | null;
  user: {
    totalMinedEcho: number;
    totalPurchasedEcho: number;
    purchaseMultiplier: number;
    referralMultiplier: number;
  };
  session: {
    isActive: boolean;
    startedAt: Date | null;
    lastAccruedAt: Date | null;
    baseRatePerHr: number;
    multiplier: number;
    sessionMined: number;
    endsAt: Date | null;
  } | null;
  streak: {
    currentStreak: number;
    nextMultiplier: number;
    lastSessionEndAt: Date | null;
    graceEndsAt: Date | null;
  };
}) {
  return {
    ok: true,
    authed: args.authed,
    wallet: {
      address: args.wallet?.address ?? null,
      verified: args.wallet?.verified ?? false,
      verifiedAt: args.wallet?.verifiedAt ? args.wallet.verifiedAt.toISOString() : null,
    },
    user: {
      totalMinedEcho: Number(args.user.totalMinedEcho ?? 0),
      totalPurchasedEcho: Number(args.user.totalPurchasedEcho ?? 0),
      purchaseMultiplier: Number(args.user.purchaseMultiplier ?? 1),
      referralMultiplier: Number(args.user.referralMultiplier ?? 1),
    },
    session: {
      isActive: args.session?.isActive ?? false,
      startedAt: args.session?.startedAt ? args.session.startedAt.toISOString() : null,
      lastAccruedAt: args.session?.lastAccruedAt
        ? args.session.lastAccruedAt.toISOString()
        : null,
      baseRatePerHr