// app/api/mining/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { baseRatePerHr?: number; multiplier?: number };

const SESSION_DURATION_SECONDS = 60 * 60 * 24; // 24 hours
const DEFAULT_BASE_RATE_PER_HR = 1;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export async function POST(req: Request) {
  try {
    const authedUser = await getUserFromSessionCookie();
    if (!authedUser) {
      return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
    }

    // Re-check wallet verification from DB (don’t trust cookie shape)
    const wallet = await prisma.wallet.findFirst({
      where: { userId: authedUser.id },
      select: { verified: true },
    });

    if (!wallet?.verified) {
      return NextResponse.json({ ok: false, error: "Wallet not verified" }, { status: 401 });
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const baseRatePerHr =
      body.baseRatePerHr == null ? DEFAULT_BASE_RATE_PER_HR : Number(body.baseRatePerHr);
    const multiplier = body.multiplier == null ? 1 : Number(body.multiplier);

    if (!Number.isFinite(baseRatePerHr) || baseRatePerHr <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid baseRatePerHr" }, { status: 400 });
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid multiplier" }, { status: 400 });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.miningSession.findUnique({
        where: { userId: authedUser.id },
      });

      // If there is an active session, decide what to do before starting a new one.
      if (existing?.isActive && existing.startedAt) {
        const endsAt = new Date(existing.startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);

        // Still running -> do NOT overwrite it (this is the “lost previous session” bug)
        if (now.getTime() < endsAt.getTime()) {
          return {
            kind: "already_active" as const,
            endsAt,
            session: existing,
          };
        }

        // Session should have ended -> settle remaining accrual, archive, reset
        const lastAccruedAt = existing.lastAccruedAt ?? existing.startedAt;
        const effectiveNow = endsAt; // settle to end boundary

        const deltaSeconds = Math.floor((effectiveNow.getTime() - lastAccruedAt.getTime()) / 1000);
        const safeDeltaSeconds = clamp(deltaSeconds, 0, SESSION_DURATION_SECONDS);

        const ratePerSec = (existing.baseRatePerHr * existing.multiplier) / 3600;
        const earned = round6(Math.max(0, safeDeltaSeconds * ratePerSec));

        // Apply final accrual to session + user total
        const settledSession = await tx.miningSession.update({
          where: { userId: authedUser.id },
          data: {
            sessionMined: { increment: earned },
            lastAccruedAt: effectiveNow,
            isActive: false,
          },
        });

        const updatedUser = await tx.user.update({
          where: { id: authedUser.id },
          data: { totalMinedEcho: { increment: earned } },
          select: { totalMinedEcho: true },
        });

        // Archive
        await tx.miningHistory.create({
          data: {
            userId: authedUser.id,
            startedAt: existing.startedAt,
            endedAt: endsAt,
            baseRatePerHr: existing.baseRatePerHr,
            multiplier: existing.multiplier,
            totalMined: settledSession.sessionMined,
          },
        });

        // Reset row for clean next start
        await tx.miningSession.update({
          where: { userId: authedUser.id },
          data: {
            isActive: false,
            startedAt: null,
            lastAccruedAt: null,
            sessionMined: 0,
            baseRatePerHr: 0,
            multiplier: 1,
          },
        });

        // (Optional) you can return updatedUser.totalMinedEcho if you want
        void updatedUser;
      }

      // Start a fresh session (upsert)
      const startedAt = now;
      const endsAt = new Date(startedAt.getTime() + SESSION_DURATION_SECONDS * 1000);

      const session = await tx.miningSession.upsert({
        where: { userId: authedUser.id },
        update: {
          isActive: true,
          startedAt,
          lastAccruedAt: startedAt,
          baseRatePerHr,
          multiplier,
          sessionMined: 0,
        },
        create: {
          userId: authedUser.id,
          isActive: true,
          startedAt,
          lastAccruedAt: startedAt,
          baseRatePerHr,
          multiplier,
          sessionMined: 0,
        },
      });

      return {
        kind: "started" as const,
        endsAt,
        session,
      };
    });

    if (result.kind === "already_active") {
      return NextResponse.json(
        {
          ok: false,
          error: "Session already active",
          endsAt: result.endsAt.toISOString(),
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      endsAt: result.endsAt.toISOString(),
    });
  } catch (err) {
    console.error("mining/start error:", err);
    return NextResponse.json({ ok: false, error: "Start failed" }, { status: 500 });
  }
}