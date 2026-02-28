import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { baseRatePerHr?: number; multiplier?: number };

const SESSION_DURATION_SECONDS = 60 * 60 * 3;
const DEFAULT_BASE_RATE_PER_HR = 1;

function json(data: any, init?: number) {
  return NextResponse.json(data, init ? { status: init } : undefined);
}

async function handler(req?: Request) {
  const authedUser = await getUserFromSessionCookie();
  if (!authedUser) return json({ ok: false, error: "Not logged in" }, 401);

  // Always check wallet verification from DB (don’t trust stale cookie user shape)
  const wallet = await prisma.wallet.findFirst({
    where: { userId: authedUser.id },
    select: { address: true, verified: true, verifiedAt: true },
  });

  if (!wallet?.verified) return json({ ok: false, error: "Wallet not verified" }, 401);

  let body: Body = {};
  if (req) {
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }
  }

  const baseRatePerHr =
    body.baseRatePerHr == null ? DEFAULT_BASE_RATE_PER_HR : Number(body.baseRatePerHr);
  const multiplier = body.multiplier == null ? 1 : Number(body.multiplier);

  if (!Number.isFinite(baseRatePerHr) || baseRatePerHr <= 0) {
    return json({ ok: false, error: "Invalid baseRatePerHr" }, 400);
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return json({ ok: false, error: "Invalid multiplier" }, 400);
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);

  const session = await prisma.miningSession.upsert({
    where: { userId: authedUser.id },
    update: {
      isActive: true,
      startedAt: now,
      lastAccruedAt: now,
      baseRatePerHr,
      multiplier,
      sessionMined: 0,
    },
    create: {
      userId: authedUser.id,
      isActive: true,
      startedAt: now,
      lastAccruedAt: now,
      baseRatePerHr,
      multiplier,
      sessionMined: 0,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: authedUser.id },
    select: { totalMinedEcho: true },
  });

  return json({
    ok: true,
    wallet,
    user: { totalMinedEcho: user?.totalMinedEcho ?? 0 },
    session,
    endsAt,
  });
}

// Browser visit = GET (don’t look blank)
export async function GET() {
  return json({
    ok: true,
    info: "Use POST to start a mining session. (GET is for testing.)",
  });
}

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (err) {
    console.error("mining/start error:", err);
    return json({ ok: false, error: "Start failed" }, 500);
  }
}