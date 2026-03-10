// app/api/referrals/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSessionCookie } from "@/lib/auth";
import { ensureReferralCode } from "@/lib/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromSessionCookie();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const code = await ensureReferralCode(user.id);

  const [pendingCount, qualifiedCount] = await Promise.all([
    prisma.referral.count({
      where: {
        referrerUserId: user.id,
        status: "pending",
      },
    }),
    prisma.referral.count({
      where: {
        referrerUserId: user.id,
        status: "qualified",
      },
    }),
  ]);

  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      referralMultiplier: true,
      totalReferralEcho: true,
    },
  });

  return NextResponse.json({
    ok: true,
    code,
    pendingCount,
    qualifiedCount,
    referralMultiplier: Number(userRow?.referralMultiplier ?? 1),
    totalReferralEcho: Number(userRow?.totalReferralEcho ?? 0),
  });
}