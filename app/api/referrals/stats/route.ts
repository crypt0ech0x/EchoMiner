// app/api/referrals/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { ensureReferralCode } from "@/lib/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const code = await ensureReferralCode(user.id);

    // With the current schema, users referred by this user are stored on User.referredByUserId.
    // We no longer have a separate Referral model, so:
    // - pendingCount is always 0
    // - qualifiedCount is the number of users linked to this referrer
    const [qualifiedCount, userRow] = await Promise.all([
      prisma.user.count({
        where: {
          referredByUserId: user.id,
        },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          referralMultiplier: true,
          totalReferralEcho: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      code,
      pendingCount: 0,
      qualifiedCount,
      referralMultiplier: Number(userRow?.referralMultiplier ?? 1),
      totalReferralEcho: Number(userRow?.totalReferralEcho ?? 0),
    });
  } catch (err: any) {
    console.error("referrals/stats error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to get referral stats" },
      { status: 500 }
    );
  }
}