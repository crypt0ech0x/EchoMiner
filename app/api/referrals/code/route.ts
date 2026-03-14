// app/api/referrals/code/route.ts
import { NextResponse } from "next/server";
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

    return NextResponse.json({
      ok: true,
      code,
    });
  } catch (err: any) {
    console.error("referrals/code error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to get referral code" },
      { status: 500 }
    );
  }
}